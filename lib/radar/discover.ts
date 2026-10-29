/**
 * 꿀통레이더 신규 발굴 — 아직 채널팩에 없는 '대박 신생' 채널을 찾아 팩을 추천한다.
 *
 *  찾는 곳 (2시간마다, 수집기 안에서):
 *   - 유튜브 검색(100 unit): 지금 뜨는 작품 · 채널팩마다 돌아가며 그 팩의 대표 말 · 최근 조회수 높은 쇼츠
 *   - 한국 인기 급상승 영상(4 unit) · 지금 터지는 채널이 걸어 둔 「추천 채널」(채널당 1 unit)
 *  남기는 기준 (pint 「대박 신생」과 같다): 개설 1년 이내 · 영상 400개 이하 · 영상당 평균 100만+ · 30일 안에 업로드
 *  팩 추천 (AI 없이): 그 채널 최근 영상의 말(제목·태그)이 어느 팩 영상들과 겹치나 + 작품 종류 + 쇼츠/롱폼 + 어느 팩 검색에서 찾았나
 */

import { prisma } from '@/lib/db';
import {
  QuotaGoneError,
  featuredChannels,
  fetchChannelStats,
  fetchLatestUploadIds,
  fetchVideos,
  mostPopularChannels,
  resolveChannelRef,
  searchRecentVideos,
  type YtChannelStat,
} from '@/lib/youtube/api';
import { mainTitle, resolveAliases } from './match';

const H = 3_600_000;
const D = 24 * H;

/** pint 「대박 신생」 기준 */
export const ROOKIE = { maxAgeDays: 365, maxVideos: 400, minAvgViews: 1_000_000, uploadWithinDays: 30 };
/** 발굴은 이만큼마다 */
export const DISCOVER_EVERY_MS = 2 * H;
/** 한 번에 검색 몇 번 (100 unit 씩) */
const SEARCHES_PER_RUN = 4;

/** 주제가 아니라 규모·성격으로 묶은 팩 — 추천 대상에서 뺀다 (pint 동기화의 meta 팩) */
const META_FOLDERS = new Set(['넘사', '고래', 'No양산형', '주제 자주 변경', '제외', '대기업', '방송사 채널팩', '뉴스공식', '저작권ㄱㅊ?']);
/** 작품 종류 → 그 작품 클립이 모이는 팩 */
const CATEGORY_FOLDER: Record<string, string> = {
  kr_drama: '영드짜',
  kr_movie: '영드짜',
  intl_drama: '해외 영드짜',
  intl_movie: '해외 영드짜',
  kr_variety: '한국 예능',
  intl_variety: '해외 예능',
};
/** 검색어로 쓰기엔 너무 흔한 말 */
const GENERIC = new Set(['shorts', 'short', '쇼츠', 'youtube', 'youtubeshorts', 'fyp', 'viral', '추천', '레전드', '영상', '오늘', '이유', '진짜', '결국']);

export type SampleVideo = {
  id: string;
  title: string;
  views: number;
  publishedAt: string;
  isShorts: boolean;
  durationSec: number;
  thumbnailUrl: string | null;
  tags: string[];
};
export type Suggestion = { folderId: string; name: string; score: number; reasons: string[] };

/* ───────────── 기준 ───────────── */

export function rookieCheck(c: { createdAt: Date | null; videoCount: number | null; viewCount: bigint | number | null; lastUploadAt: Date | null }) {
  const videos = c.videoCount ?? 0;
  const views = Number(c.viewCount ?? 0);
  const avg = videos > 0 ? views / videos : 0;
  const young = !!c.createdAt && Date.now() - c.createdAt.getTime() <= ROOKIE.maxAgeDays * D;
  const recent = !!c.lastUploadAt && Date.now() - c.lastUploadAt.getTime() <= ROOKIE.uploadWithinDays * D;
  return {
    ok: young && videos >= 1 && videos <= ROOKIE.maxVideos && avg >= ROOKIE.minAvgViews && recent,
    /** 최근 업로드는 모르는 채로 나머지만 */
    okExceptRecent: young && videos >= 1 && videos <= ROOKIE.maxVideos && avg >= ROOKIE.minAvgViews,
    avg,
  };
}

/** 한국 채널인가 — 나라가 KR 이거나, 나라를 안 밝혔으면 채널 이름·최근 영상 제목에 한글 */
function koreanish(stat: YtChannelStat, titles: string[]): boolean {
  if (stat.country) return stat.country === 'KR';
  if (/[가-힣]/.test(stat.title ?? '')) return true;
  return titles.length > 0 && titles.filter((t) => /[가-힣]/.test(t)).length / titles.length >= 0.3;
}

/* ───────────── 팩 추천 ───────────── */

type Profile = { id: string; name: string; format: string | null; weights: Record<string, number>; norm: number; top: string[] };

export function tokensOf(title: string, tags: string[]): string[] {
  const words = title.toLowerCase().split(/[^가-힣a-z0-9]+/);
  const t = tags.map((x) => x.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''));
  return [...words, ...t].filter((w) => w.length >= 2 && w.length <= 20 && !/^\d+$/.test(w));
}

/** 팩마다 최근 14일 인기 영상(팩당 300개)의 말 — TF-IDF 상위 150개. 하루 한 번 계산해 둔다 */
async function folderProfiles(): Promise<Profile[]> {
  const cached = await prisma.trendCache.findUnique({ where: { key: 'radar:folder-profiles' } }).catch(() => null);
  if (cached && Date.now() - cached.fetchedAt.getTime() < D) return cached.payload as unknown as Profile[];

  const rows = await prisma.$queryRaw<{ folderId: string; tok: string; n: number }[]>`
    WITH top AS (
      SELECT * FROM (
        SELECT v.title, v.tags, c."folderId", ROW_NUMBER() OVER (PARTITION BY c."folderId" ORDER BY v.views DESC) AS rn
        FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
        WHERE v."publishedAt" > NOW() - INTERVAL '14 days'
      ) x WHERE rn <= 300
    ), toks AS (
      SELECT "folderId", t FROM top, LATERAL (
        SELECT regexp_split_to_table(lower(title), '[^가-힣a-z0-9]+') AS t
        UNION ALL
        SELECT lower(regexp_replace(g, '[[:space:][:punct:]]', '', 'g')) FROM unnest(tags) g
      ) s
    )
    SELECT "folderId", t AS tok, COUNT(*)::int AS n FROM toks
    WHERE length(t) BETWEEN 2 AND 20 AND t !~ '^[0-9]+$'
    GROUP BY 1, 2 HAVING COUNT(*) >= 3`;
  const folders = await prisma.folder.findMany({ select: { id: true, name: true } });
  const formats = await prisma.$queryRaw<{ folderId: string; fmt: string | null; n: number }[]>`
    SELECT "folderId", "contentFormat" AS fmt, COUNT(*)::int AS n FROM "Channel"
    WHERE "isActive" AND platform = 'YOUTUBE' GROUP BY 1, 2`;

  const use = new Map(folders.filter((f) => !f.name.startsWith('__') && !META_FOLDERS.has(f.name)).map((f) => [f.id, f.name]));
  const byFolder = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  for (const r of rows) {
    if (!use.has(r.folderId)) continue;
    let m = byFolder.get(r.folderId);
    if (!m) byFolder.set(r.folderId, (m = new Map()));
    m.set(r.tok, r.n);
  }
  for (const m of byFolder.values()) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const F = byFolder.size || 1;

  const fmtBy = new Map<string, Map<string, number>>();
  for (const f of formats) {
    let m = fmtBy.get(f.folderId);
    if (!m) fmtBy.set(f.folderId, (m = new Map()));
    m.set(f.fmt ?? '', f.n);
  }
  const out: Profile[] = [];
  for (const [id, m] of byFolder) {
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    const scored = [...m.entries()]
      .map(([t, n]) => [t, (n / total) * Math.log(1 + F / (df.get(t) ?? 1))] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 150);
    const weights = Object.fromEntries(scored);
    const fm = fmtBy.get(id);
    const fmTotal = fm ? [...fm.values()].reduce((a, b) => a + b, 0) : 0;
    const dominant = fm ? [...fm.entries()].sort((a, b) => b[1] - a[1])[0] : null;
    out.push({
      id,
      name: use.get(id)!,
      format: dominant && dominant[0] && fmTotal > 0 && dominant[1] / fmTotal >= 0.6 ? dominant[0] : null,
      weights,
      norm: Math.sqrt(scored.reduce((a, [, w]) => a + w * w, 0)) || 1,
      top: scored.map(([t]) => t).filter((t) => !GENERIC.has(t) && t.length >= 2).slice(0, 5),
    });
  }
  await prisma.trendCache.upsert({
    where: { key: 'radar:folder-profiles' },
    create: { key: 'radar:folder-profiles', payload: out as object },
    update: { payload: out as object, fetchedAt: new Date() },
  });
  return out;
}

/** 최근 영상으로 팩 추천 — 위에서 3개 */
async function suggestFor(samples: SampleVideo[], format: string | null, sourceFolderId: string | null, profiles: Profile[]): Promise<Suggestion[]> {
  const cv = new Map<string, number>();
  for (const v of samples) for (const t of tokensOf(v.title, v.tags)) cv.set(t, (cv.get(t) ?? 0) + 1);
  const cnorm = Math.sqrt([...cv.values()].reduce((a, n) => a + n * n, 0)) || 1;

  // 최근 영상에 붙은 작품 (이미 아는 말만 — TMDB 는 묻지 않는다)
  const words = samples.flatMap((v) => [...v.tags, ...(v.title.match(/#([^\s#]+)/g) ?? []).map((h) => h.slice(1))]);
  const aliases = await resolveAliases(words, Date.now() + 3000, { ask: () => false });
  const workIds = [...new Set([...aliases.values()].map((a) => a.workId).filter((w): w is string => !!w))];
  const works = workIds.length
    ? await prisma.radarWork.findMany({ where: { id: { in: workIds } }, select: { id: true, title: true, category: true } })
    : [];
  const byCat = new Map<string, { n: number; titles: string[] }>();
  for (const w of works) {
    const folder = CATEGORY_FOLDER[w.category];
    if (!folder) continue;
    const e = byCat.get(folder) ?? { n: 0, titles: [] };
    e.n++;
    if (e.titles.length < 2) e.titles.push(mainTitle(w.title));
    byCat.set(folder, e);
  }

  const out: Suggestion[] = [];
  for (const p of profiles) {
    let dot = 0;
    const shared: [string, number][] = [];
    for (const [t, n] of cv) {
      const w = p.weights[t];
      if (!w) continue;
      dot += n * w;
      shared.push([t, n * w]);
    }
    let score = dot / (cnorm * p.norm);
    const reasons: string[] = [];
    if (shared.length) {
      shared.sort((a, b) => b[1] - a[1]);
      reasons.push('겹치는 말: ' + shared.slice(0, 4).map(([t]) => t).join(' · '));
    }
    const cat = byCat.get(p.name);
    if (cat) {
      score += 0.25 * Math.min(1, cat.n / 2);
      reasons.push(`작품 클립: 「${cat.titles.join('」 「')}」`);
    }
    if (sourceFolderId === p.id) {
      score += 0.15;
      reasons.push('이 팩 검색에서 찾음');
    }
    if (p.format && format && format !== 'hybrid' && p.format !== format) score *= 0.7;
    if (score > 0.03) out.push({ folderId: p.id, name: p.name, score: Math.min(1, Math.round(score * 100) / 100), reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

/* ───────────── 후보 채우기 (통계 · 최근 영상 · 추천) ───────────── */

async function samplesOf(externalId: string, spend: (u: number) => void): Promise<SampleVideo[]> {
  const ids = await fetchLatestUploadIds(externalId, 12).catch((e) => {
    if (e instanceof QuotaGoneError) throw e;
    return [] as string[];
  });
  spend(1);
  if (!ids.length) return [];
  const vids = await fetchVideos(ids, true);
  spend(1);
  return vids
    .filter((v) => !v.upcoming)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .map((v) => ({
      id: v.id,
      title: v.title,
      views: v.views,
      publishedAt: v.publishedAt.toISOString(),
      isShorts: v.isShorts,
      durationSec: v.durationSec,
      thumbnailUrl: v.thumbnailUrl,
      tags: [...v.tags, ...(v.descTags ?? [])].slice(0, 20),
    }));
}

function formatOf(samples: SampleVideo[]): string | null {
  if (!samples.length) return null;
  const r = samples.filter((v) => v.isShorts).length / samples.length;
  return r >= 0.8 ? 'shorts' : r <= 0.2 ? 'long' : 'hybrid';
}

/** 통계를 받아 후보로 쓴다. 기준을 못 넘으면 keepAnyway 일 때만 남긴다. 남겼으면 true */
async function fill(
  stat: YtChannelStat,
  o: { source: string; sourceFolderId?: string | null; seenAt?: Date | null; keepAnyway?: boolean },
  profiles: Profile[],
  spend: (u: number) => void
): Promise<boolean> {
  const pre = rookieCheck({ createdAt: stat.createdAt, videoCount: stat.videoCount, viewCount: stat.viewCount, lastUploadAt: o.seenAt ?? null });
  if (!o.keepAnyway && !pre.okExceptRecent) return false;
  const samples = await samplesOf(stat.id, spend);
  const last = samples[0] ? new Date(samples[0].publishedAt) : o.seenAt ?? null;
  const check = rookieCheck({ createdAt: stat.createdAt, videoCount: stat.videoCount, viewCount: stat.viewCount, lastUploadAt: last });
  if (!o.keepAnyway && (!check.ok || !koreanish(stat, samples.map((v) => v.title)))) return false;
  const format = formatOf(samples);
  const suggestions = await suggestFor(samples, format, o.sourceFolderId ?? null, profiles);
  const data = {
    title: stat.title,
    handle: stat.handle,
    thumbnailUrl: stat.thumbnailUrl,
    country: stat.country,
    channelCreatedAt: stat.createdAt,
    subscriberCount: stat.subscriberCount,
    viewCount: stat.viewCount,
    videoCount: stat.videoCount,
    lastUploadAt: last,
    contentFormat: format,
    sampleVideos: samples.slice(0, 8) as object,
    suggestions: suggestions as object,
    qualified: check.ok,
    checkedAt: new Date(),
  };
  await prisma.radarCandidate.upsert({
    where: { externalId: stat.id },
    create: { externalId: stat.id, source: o.source, sourceFolderId: o.sourceFolderId ?? null, ...data },
    update: data,
  });
  return true;
}

/* ───────────── 발굴 (수집기가 부른다) ───────────── */

export type DiscoverReport = { searches: number; seeds: number; checked: number; found: number; enriched: number };

/** search=false 면 직접 넣었거나 pint 목록에서 온 후보만 채운다 (검색 없이 — 2시간을 기다리지 않게 매번) */
export async function runDiscovery(o: { canSpend: (u: number) => boolean; spend: (u: number) => void; deadline: number; search?: boolean }): Promise<DiscoverReport> {
  const report: DiscoverReport = { searches: 0, seeds: 0, checked: 0, found: 0, enriched: 0 };
  const left = () => Date.now() < o.deadline;
  const profiles = await folderProfiles();

  // 1. 직접 넣었거나 pint 목록에서 온 후보 중 아직 통계를 안 받은 것
  const pending = await prisma.radarCandidate.findMany({ where: { status: 'new', checkedAt: null }, take: 40 });
  if (pending.length && o.canSpend(1)) {
    const stats = await fetchChannelStats(pending.map((p) => p.externalId));
    o.spend(Math.ceil(pending.length / 50));
    const byId = new Map(pending.map((p) => [p.externalId, p]));
    for (const s of stats) {
      if (!left() || !o.canSpend(2)) break;
      const p = byId.get(s.id)!;
      await fill(s, { source: p.source, sourceFolderId: p.sourceFolderId, keepAnyway: true }, profiles, o.spend);
      report.enriched++;
    }
  }

  if (o.search === false) return report;

  // 2. 씨앗 — 어디서 본 채널인가
  const seeds = new Map<string, { source: string; folderId: string | null; seenAt: Date | null }>();
  const addSeed = (id: string, source: string, folderId: string | null, seenAt: Date | null) => {
    const s = seeds.get(id);
    if (!s || (seenAt && (!s.seenAt || seenAt > s.seenAt))) seeds.set(id, { source: s?.source ?? source, folderId: s?.folderId ?? folderId, seenAt });
  };

  if (left() && o.canSpend(4)) {
    for (const v of await mostPopularChannels(4)) addSeed(v.channelId, '인기 급상승', null, v.publishedAt);
    o.spend(4);
  }

  // 검색어: 지금 뜨는 작품 · 팩 돌아가며 (그 팩 대표 말) · 6시간마다 최근 조회수 상위 쇼츠
  const cur = await prisma.trendCache.findUnique({ where: { key: 'radar:discover-cursor' } }).catch(() => null);
  const cursor = (cur?.payload as { i?: number; genericAt?: number } | null) ?? {};
  const queries: { q: string; source: string; folderId: string | null; short?: boolean }[] = [];
  let genericAt = cursor.genericAt ?? 0;
  if (Date.now() - genericAt > 6 * H) {
    queries.push({ q: '', source: '최근 조회수 상위 쇼츠', folderId: null, short: true });
    genericAt = Date.now();
  }
  const hotWorks = await prisma.$queryRaw<{ title: string }[]>`
    SELECT w.title FROM "RadarVideo" v JOIN "RadarWork" w ON w.id = v."workId"
    WHERE v."publishedAt" > NOW() - INTERVAL '48 hours'
    GROUP BY w.id, w.title ORDER BY SUM(v.views) DESC LIMIT 1`;
  for (const w of hotWorks) queries.push({ q: mainTitle(w.title), source: `검색 「${mainTitle(w.title)}」`, folderId: null });
  const topical = profiles.filter((p) => p.top.length).sort((a, b) => a.name.localeCompare(b.name));
  let i = (cursor.i ?? 0) % Math.max(1, topical.length);
  while (topical.length && queries.length < SEARCHES_PER_RUN) {
    const p = topical[i];
    queries.push({ q: p.top[0], source: `${p.name} 검색 「${p.top[0]}」`, folderId: p.id });
    i = (i + 1) % topical.length;
  }
  await prisma.trendCache.upsert({
    where: { key: 'radar:discover-cursor' },
    create: { key: 'radar:discover-cursor', payload: { i, genericAt } },
    update: { payload: { i, genericAt }, fetchedAt: new Date() },
  });
  const since = new Date(Date.now() - 7 * D);
  const runnable = queries.filter(() => left() && o.canSpend(100));
  await Promise.all(
    runnable.map(async (q) => {
      try {
        const hits = await searchRecentVideos(q.q, { since, short: q.short });
        o.spend(100);
        report.searches++;
        for (const h of hits) addSeed(h.channelId, q.source, q.folderId, h.publishedAt);
      } catch (e) {
        if (e instanceof QuotaGoneError) throw e;
      }
    })
  );

  // 지금 터지는 채널이 걸어 둔 「추천 채널」
  const hotChannels = await prisma.$queryRaw<{ externalId: string }[]>`
    SELECT c."externalId" FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
    WHERE v."publishedAt" > NOW() - INTERVAL '48 hours' AND v."gain24h" IS NOT NULL
    GROUP BY c."externalId" ORDER BY SUM(v."gain24h") DESC LIMIT 5`;
  if (left() && o.canSpend(hotChannels.length)) {
    const lists = await Promise.all(hotChannels.map((h) => featuredChannels(h.externalId)));
    o.spend(hotChannels.length);
    for (const l of lists) for (const id of l) addSeed(id, '추천 채널', null, null);
  }

  // 3. 이미 아는 채널은 빼고 통계
  const ids = [...seeds.keys()];
  report.seeds = ids.length;
  if (!ids.length) return report;
  const [known, archived, cands] = await Promise.all([
    prisma.channel.findMany({ where: { platform: 'YOUTUBE', externalId: { in: ids } }, select: { externalId: true } }),
    prisma.archivedChannel.findMany({ where: { externalId: { in: ids } }, select: { externalId: true } }),
    prisma.radarCandidate.findMany({ where: { externalId: { in: ids } }, select: { externalId: true } }),
  ]);
  const skip = new Set([...known, ...archived, ...cands].map((c) => c.externalId));
  const fresh = ids.filter((id) => !skip.has(id));
  for (let i = 0; i < fresh.length && left(); i += 50) {
    if (!o.canSpend(1)) break;
    const slice = fresh.slice(i, i + 50);
    const stats = await fetchChannelStats(slice);
    o.spend(1);
    report.checked += stats.length;
    for (const s of stats) {
      if (!left() || !o.canSpend(2)) break;
      const seed = seeds.get(s.id)!;
      if (await fill(s, { source: seed.source, sourceFolderId: seed.folderId, seenAt: seed.seenAt }, profiles, o.spend)) report.found++;
    }
  }
  return report;
}

/* ───────────── 화면 ───────────── */

export type CandidateRow = {
  externalId: string;
  title: string | null;
  handle: string | null;
  thumbnailUrl: string | null;
  channelCreatedAt: string | null;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
  avgViews: number | null;
  lastUploadAt: string | null;
  contentFormat: string | null;
  sampleVideos: SampleVideo[];
  source: string;
  suggestions: Suggestion[];
  status: string;
  folderId: string | null;
  qualified: boolean;
  checked: boolean;
  foundAt: string;
};

export type CandidateList = {
  rows: CandidateRow[];
  counts: { new: number; added: number; rejected: number };
  folders: { id: string; name: string }[];
};

export async function listCandidates(status: 'new' | 'added' | 'rejected'): Promise<CandidateList> {
  const [rows, grouped, folders] = await Promise.all([
    prisma.radarCandidate.findMany({
      where: { status },
      orderBy: status === 'new' ? [{ qualified: 'desc' }, { foundAt: 'desc' }] : [{ decidedAt: 'desc' }],
      take: 200,
    }),
    prisma.radarCandidate.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.folder.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return {
    rows: rows.map((r) => ({
      externalId: r.externalId,
      title: r.title,
      handle: r.handle,
      thumbnailUrl: r.thumbnailUrl,
      channelCreatedAt: r.channelCreatedAt?.toISOString() ?? null,
      subscriberCount: r.subscriberCount,
      viewCount: r.viewCount == null ? null : Number(r.viewCount),
      videoCount: r.videoCount,
      avgViews: r.viewCount != null && r.videoCount ? Math.round(Number(r.viewCount) / r.videoCount) : null,
      lastUploadAt: r.lastUploadAt?.toISOString() ?? null,
      contentFormat: r.contentFormat,
      sampleVideos: (r.sampleVideos as unknown as SampleVideo[]) ?? [],
      source: r.source,
      suggestions: (r.suggestions as unknown as Suggestion[]) ?? [],
      status: r.status,
      folderId: r.folderId,
      qualified: r.qualified,
      checked: !!r.checkedAt,
      foundAt: r.foundAt.toISOString(),
    })),
    counts: { new: count('new'), added: count('added'), rejected: count('rejected') },
    folders: folders.filter((f) => !f.name.startsWith('__')),
  };
}

/** 팩에 넣기 — 채널이 되고 최근 영상도 바로 추적을 시작한다. newFolder 면 그 이름으로 팩을 만든다 */
export async function acceptCandidate(externalId: string, target: { folderId?: string; newFolder?: string }): Promise<{ folderId: string; folderName: string }> {
  const c = await prisma.radarCandidate.findUnique({ where: { externalId } });
  if (!c) throw new Error('후보를 찾지 못했습니다');
  let folder: { id: string; name: string } | null = null;
  const newName = target.newFolder?.trim();
  if (newName) {
    const max = await prisma.folder.aggregate({ _max: { sortOrder: true } });
    folder = await prisma.folder.upsert({
      where: { name: newName },
      create: { name: newName, sortOrder: (max._max.sortOrder ?? 0) + 1 },
      update: {},
      select: { id: true, name: true },
    });
  } else if (target.folderId) {
    folder = await prisma.folder.findUnique({ where: { id: target.folderId }, select: { id: true, name: true } });
  }
  if (!folder) throw new Error('팩을 고르세요');

  const ch = await prisma.channel.upsert({
    where: { platform_externalId: { platform: 'YOUTUBE', externalId } },
    create: {
      platform: 'YOUTUBE',
      externalId,
      handle: c.handle,
      displayName: c.title,
      thumbnailUrl: c.thumbnailUrl,
      subscriberCount: c.subscriberCount,
      totalViewCount: c.viewCount,
      folderId: folder.id,
      channelCreatedAt: c.channelCreatedAt,
      videoCount: c.videoCount,
      lastUploadAt: c.lastUploadAt,
      contentFormat: c.contentFormat,
      // 최근 영상은 아래에서 바로 넣으니 그 뒤로 올라온 것부터 찾게
      uploadsSeenCount: c.videoCount,
      uploadsCheckedAt: new Date(),
    },
    update: { folderId: folder.id, isActive: true },
    select: { id: true },
  });

  const samples = (c.sampleVideos as unknown as SampleVideo[]) ?? [];
  const nowMin = Math.floor(Date.now() / 60_000);
  const cutoff = Date.now() - 30 * D;
  const rows = samples
    .filter((v) => new Date(v.publishedAt).getTime() >= cutoff)
    .map((v) => ({
      id: v.id,
      channelId: ch.id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      publishedAt: new Date(v.publishedAt),
      durationSec: v.durationSec,
      isShorts: v.isShorts,
      views: v.views,
      tags: v.tags,
      trackT: [nowMin],
      trackV: [v.views],
      // 다음 수집 때 바로 다시 재서 시간당 증가가 나오게
      checkedAt: new Date(Date.now() - 2 * H),
    }));
  if (rows.length) await prisma.radarVideo.createMany({ data: rows, skipDuplicates: true });
  await prisma.radarCandidate.update({ where: { externalId }, data: { status: 'added', folderId: folder.id, decidedAt: new Date() } });
  return { folderId: folder.id, folderName: folder.name };
}

export async function rejectCandidate(externalId: string): Promise<void> {
  await prisma.radarCandidate.update({ where: { externalId }, data: { status: 'rejected', decidedAt: new Date() } });
}

/** 다시 후보로 (제외 취소) */
export async function restoreCandidate(externalId: string): Promise<void> {
  await prisma.radarCandidate.update({ where: { externalId }, data: { status: 'new', decidedAt: null } });
}

/** 추천 1순위가 minScore 이상인 새 후보를 모두 그 팩에 */
export async function acceptAllSuggested(minScore = 0.3): Promise<number> {
  const rows = await prisma.radarCandidate.findMany({ where: { status: 'new', qualified: true }, select: { externalId: true, suggestions: true } });
  let n = 0;
  for (const r of rows) {
    const top = ((r.suggestions as unknown as Suggestion[]) ?? [])[0];
    if (!top || top.score < minScore) continue;
    await acceptCandidate(r.externalId, { folderId: top.folderId });
    n++;
  }
  return n;
}

/** 채널 링크·@핸들·UC ID 를 붙여넣어 후보로 (기준 밖이어도 남긴다) */
export async function addCandidatesByLinks(text: string): Promise<{ added: number; existing: { name: string; folder: string }[]; failed: string[] }> {
  const refs = [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))].slice(0, 50);
  const failed: string[] = [];
  const ids: string[] = [];
  for (const r of refs) {
    const id = await resolveChannelRef(r).catch(() => null);
    if (id) ids.push(id);
    else failed.push(r);
  }
  const known = await prisma.channel.findMany({
    where: { platform: 'YOUTUBE', externalId: { in: ids } },
    select: { externalId: true, displayName: true, folder: { select: { name: true } } },
  });
  const knownIds = new Set(known.map((k) => k.externalId));
  const todo = ids.filter((id) => !knownIds.has(id));
  let added = 0;
  if (todo.length) {
    const profiles = await folderProfiles();
    const stats = await fetchChannelStats(todo);
    for (const s of stats) {
      await prisma.radarCandidate.upsert({ where: { externalId: s.id }, create: { externalId: s.id, source: '직접 추가' }, update: { status: 'new' } });
      await fill(s, { source: '직접 추가', keepAnyway: true }, profiles, () => {});
      added++;
    }
    for (const id of todo) if (!stats.some((s) => s.id === id)) failed.push(id);
  }
  return { added, existing: known.map((k) => ({ name: k.displayName ?? k.externalId, folder: k.folder.name })), failed };
}

/** 이미 팩에 있는 채널 중 '대박 신생' 기준에 맞는 것 (pint 신규 발굴처럼) */
export type RookieRow = {
  externalId: string;
  name: string | null;
  thumbnailUrl: string | null;
  folder: string;
  channelCreatedAt: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  avgViews: number;
  dailyViews: number | null;
  lastUploadAt: string | null;
  contentFormat: string | null;
};

export async function rookiesInPacks(): Promise<RookieRow[]> {
  const rows = await prisma.$queryRaw<
    { externalId: string; name: string | null; thumbnailUrl: string | null; folder: string; created: Date | null; subs: number | null; videos: number | null; avg: number; daily: number | null; last: Date | null; fmt: string | null }[]
  >`
    SELECT c."externalId", c."displayName" AS name, c."thumbnailUrl", f.name AS folder, c."channelCreatedAt" AS created,
      c."subscriberCount" AS subs, c."videoCount" AS videos, (c."totalViewCount" / NULLIF(c."videoCount", 0))::float8 AS avg,
      c."dailyViews" AS daily, c."lastUploadAt" AS last, c."contentFormat" AS fmt
    FROM "Channel" c JOIN "Folder" f ON f.id = c."folderId"
    WHERE c."isActive" AND c.platform = 'YOUTUBE'
      AND c."channelCreatedAt" > NOW() - make_interval(days => ${ROOKIE.maxAgeDays}::int)
      AND c."videoCount" BETWEEN 1 AND ${ROOKIE.maxVideos}::int
      AND c."totalViewCount" / NULLIF(c."videoCount", 0) >= ${ROOKIE.minAvgViews}::int
      AND c."lastUploadAt" > NOW() - make_interval(days => ${ROOKIE.uploadWithinDays}::int)
    ORDER BY c."dailyViews" DESC NULLS LAST
    LIMIT 200`;
  return rows.map((r) => ({
    externalId: r.externalId,
    name: r.name,
    thumbnailUrl: r.thumbnailUrl,
    folder: r.folder,
    channelCreatedAt: r.created?.toISOString() ?? null,
    subscriberCount: r.subs,
    videoCount: r.videos,
    avgViews: Math.round(r.avg),
    dailyViews: r.daily,
    lastUploadAt: r.last?.toISOString() ?? null,
    contentFormat: r.fmt,
  }));
}

/** 다음 발굴 시각이 됐나 · 아직 통계를 안 받은 후보가 있나 */
export async function discoveryDue(): Promise<{ search: boolean; pending: boolean }> {
  const [m, pending] = await Promise.all([
    prisma.trendCache.findUnique({ where: { key: 'radar:discover' } }).catch(() => null),
    prisma.radarCandidate.count({ where: { status: 'new', checkedAt: null } }).catch(() => 0),
  ]);
  return { search: !m || Date.now() - m.fetchedAt.getTime() > DISCOVER_EVERY_MS, pending: pending > 0 };
}

export async function markDiscovered(r: DiscoverReport): Promise<void> {
  await prisma.trendCache.upsert({
    where: { key: 'radar:discover' },
    create: { key: 'radar:discover', payload: r },
    update: { payload: r, fetchedAt: new Date() },
  });
}

