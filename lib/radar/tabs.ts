/**
 * 꿀통레이더 나머지 탭 데이터 — 진입 성적표 · 인물선점 · 결 지도 · 편성표 · 시즌·오픈 · 황금키워드 · 속도전 · 시상식 · 홈.
 * 모두 수집기가 모은 영상(RadarVideo)·작품(RadarWork)·출연자(RadarPerson)·과거 트래픽(PastHit)에서,
 * 편성표·시즌·오픈은 TMDB 방영 정보(6시간 캐시), 황금키워드는 네이버 검색광고 검색수(3일 캐시)를 더한다.
 */

import { prisma } from '@/lib/db';
import { cached } from '@/lib/trends/cache';
import { getVolumes, volumeKey } from '@/lib/trends/naver-searchad';
import type { PersonCredit } from './match';
import { GENRE_LABEL, categoryOf, tmdb } from './tmdb';
import type { WorkCategory } from './types';

const H = 3_600_000;
const D = 24 * H;

export type MiniVideo = { id: string; title: string; views: number; publishedAt: string; channel: string; isShorts: boolean | null };
export type MiniWork = {
  id: string;
  title: string;
  year: string | null;
  category: WorkCategory;
  posterPath: string | null;
  networks: string[];
  onAir: boolean;
};

const workOf = (w: {
  id: string;
  title: string;
  year: string | null;
  category: string;
  posterPath: string | null;
  networks: string[];
  onAir: boolean;
}): MiniWork => ({ id: w.id, title: w.title, year: w.year, category: w.category as WorkCategory, posterPath: w.posterPath, networks: w.networks, onAir: w.onAir });

type VRow = { id: string; title: string; views: number; publishedAt: Date; channel: string; isShorts: boolean | null; workId: string | null };
const vid = (v: VRow): MiniVideo => ({ id: v.id, title: v.title, views: v.views, publishedAt: v.publishedAt.toISOString(), channel: v.channel, isShorts: v.isShorts });

async function topVideosByWork(workIds: string[], since: Date, per = 3): Promise<Map<string, MiniVideo[]>> {
  const out = new Map<string, MiniVideo[]>();
  if (!workIds.length) return out;
  const rows = await prisma.$queryRaw<VRow[]>`
    SELECT * FROM (
      SELECT v.id, v.title, v.views, v."publishedAt", COALESCE(c."displayName", c."externalId") AS channel, v."isShorts", v."workId",
        ROW_NUMBER() OVER (PARTITION BY v."workId" ORDER BY v.views DESC) AS rn
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."workId" = ANY(${workIds}::text[]) AND v."publishedAt" > ${since}
    ) t WHERE rn <= ${per}`;
  for (const r of rows) {
    const list = out.get(r.workId!) ?? [];
    list.push(vid(r));
    out.set(r.workId!, list);
  }
  return out;
}

/* ───────────── 진입 성적표 ───────────── */

export type EntryRow = {
  work: MiniWork;
  firstAt: string;
  shorts: number;
  channels: number;
  medianViews: number;
  maxViews: number;
  /** 첫 쇼츠들이 각 채널 평소(중앙값)의 몇 배였나 */
  multiple: number | null;
  verdict: 'go' | 'ok' | 'weak';
  top: MiniVideo[];
};

/** 최근 14일 안에 감시 채널에서 처음 다뤄지기 시작한 작품 — 첫 쇼츠들의 성적으로 지금 들어가도 되는지 */
export async function getEntries(): Promise<EntryRow[]> {
  const rows = await prisma.$queryRaw<
    { workId: string; firstAt: Date; shorts: number; channels: number; med: number; maxv: number; mult: number | null }[]
  >`
    SELECT v."workId", MIN(v."publishedAt") AS "firstAt", COUNT(*)::int AS shorts, COUNT(DISTINCT v."channelId")::int AS channels,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY v.views)::float AS med, MAX(v.views)::int AS maxv,
      AVG(v.views::float / NULLIF(c."baselineMedian", 0))::float AS mult
    FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
    WHERE v."workId" IS NOT NULL
    GROUP BY v."workId"
    HAVING MIN(v."publishedAt") > NOW() - INTERVAL '14 days'
    ORDER BY MAX(v.views) DESC
    LIMIT 40`;
  const works = new Map((await prisma.radarWork.findMany({ where: { id: { in: rows.map((r) => r.workId) } } })).map((w) => [w.id, w]));
  const tops = await topVideosByWork(rows.map((r) => r.workId), new Date(Date.now() - 30 * D));
  return rows
    .filter((r) => works.has(r.workId))
    .map((r) => {
      const verdict: EntryRow['verdict'] =
        r.mult != null ? (r.mult >= 1.5 ? 'go' : r.mult >= 0.8 ? 'ok' : 'weak') : r.med >= 300_000 ? 'go' : r.med >= 50_000 ? 'ok' : 'weak';
      return {
        work: workOf(works.get(r.workId)!),
        firstAt: r.firstAt.toISOString(),
        shorts: r.shorts,
        channels: r.channels,
        medianViews: Math.round(r.med),
        maxViews: r.maxv,
        multiple: r.mult,
        verdict,
        top: tops.get(r.workId) ?? [],
      };
    });
}

/* ───────────── 인물선점 ───────────── */

export type PersonRow = {
  id: number;
  name: string;
  profilePath: string | null;
  recentViews: number;
  prevViews: number;
  recentShorts: number;
  /** 지난주 대비 % (지난주 0 이면 null) */
  growth: number | null;
  works: { id: string; title: string; views: number }[];
  /** 감시 채널에 아직 쇼츠가 없는 출연작 — 선점 후보 */
  open: { title: string; year: string | null; category: string }[];
};

/** 출연작 쇼츠 조회가 막 늘기 시작한 배우 — 최근 7일 vs 그 전 7일 */
export async function getPersons(): Promise<PersonRow[]> {
  const rows = await prisma.$queryRaw<
    { pid: number; name: string; recent: bigint | null; prev: bigint | null; shorts: number; works: { id: string; title: string; views: number }[] }[]
  >`
    WITH cv AS (
      SELECT (c->>'id')::int AS pid, c->>'name' AS name, v.views, v."publishedAt", w.id AS wid, w.title
      FROM "RadarVideo" v
      JOIN "RadarWork" w ON w.id = v."workId"
      CROSS JOIN LATERAL jsonb_array_elements(w.cast) c
      WHERE (c->>'order')::int < 4 AND v."publishedAt" > NOW() - INTERVAL '14 days'
    ), pw AS (
      SELECT pid, wid, title, SUM(views) FILTER (WHERE "publishedAt" > NOW() - INTERVAL '7 days') AS v FROM cv GROUP BY pid, wid, title
    )
    SELECT cv.pid, MIN(cv.name) AS name,
      SUM(cv.views) FILTER (WHERE cv."publishedAt" > NOW() - INTERVAL '7 days') AS recent,
      SUM(cv.views) FILTER (WHERE cv."publishedAt" <= NOW() - INTERVAL '7 days') AS prev,
      COUNT(*) FILTER (WHERE cv."publishedAt" > NOW() - INTERVAL '7 days')::int AS shorts,
      (SELECT jsonb_agg(jsonb_build_object('id', pw.wid, 'title', pw.title, 'views', COALESCE(pw.v, 0)) ORDER BY pw.v DESC NULLS LAST)
         FROM pw WHERE pw.pid = cv.pid) AS works
    FROM cv GROUP BY cv.pid
    HAVING SUM(cv.views) FILTER (WHERE cv."publishedAt" > NOW() - INTERVAL '7 days') > 0
    ORDER BY recent DESC NULLS LAST
    LIMIT 40`;
  const persons = new Map((await prisma.radarPerson.findMany({ where: { id: { in: rows.map((r) => r.pid) } } })).map((p) => [p.id, p]));
  const covered = new Set(
    (await prisma.radarVideo.findMany({ where: { workId: { not: null } }, select: { workId: true }, distinct: ['workId'] })).map((v) => v.workId!)
  );
  return rows.map((r) => {
    const p = persons.get(r.pid);
    const recent = Number(r.recent ?? 0);
    const prev = Number(r.prev ?? 0);
    const credits = ((p?.credits as unknown as PersonCredit[]) ?? []).filter((c) => !covered.has(c.workId));
    return {
      id: r.pid,
      name: r.name,
      profilePath: p?.profilePath ?? null,
      recentViews: recent,
      prevViews: prev,
      recentShorts: r.shorts,
      growth: prev > 0 ? Math.round(((recent - prev) / prev) * 100) : null,
      works: (r.works ?? []).slice(0, 4),
      open: credits.slice(0, 5).map((c) => ({ title: c.title, year: c.year, category: c.category })),
    };
  });
}

/* ───────────── 결 지도 ───────────── */

export type ToneGroup = { genre: number; label: string; views: number; works: (MiniWork & { views: number; shorts: number })[] };

/** 장르(결)별로 최근 7일 쇼츠 조회가 몰린 작품 — 한 작품을 했으면 같은 결로 이어가기 */
export async function getTones(): Promise<ToneGroup[]> {
  const rows = await prisma.$queryRaw<{ wid: string; views: bigint; shorts: number }[]>`
    SELECT v."workId" AS wid, SUM(v.views) AS views, COUNT(*)::int AS shorts
    FROM "RadarVideo" v WHERE v."workId" IS NOT NULL AND v."publishedAt" > NOW() - INTERVAL '7 days'
    GROUP BY v."workId" ORDER BY SUM(v.views) DESC LIMIT 200`;
  const works = await prisma.radarWork.findMany({ where: { id: { in: rows.map((r) => r.wid) } } });
  const stat = new Map(rows.map((r) => [r.wid, r]));
  const groups = new Map<number, ToneGroup>();
  for (const w of works) {
    const s = stat.get(w.id)!;
    // '드라마'(18)는 거의 모든 드라마라 다른 장르가 있으면 뺀다
    const genres = w.genres.length > 1 ? w.genres.filter((g) => g !== 18) : w.genres;
    for (const g of genres) {
      const label = GENRE_LABEL[g];
      if (!label) continue;
      const grp = groups.get(g) ?? { genre: g, label, views: 0, works: [] };
      grp.views += Number(s.views);
      grp.works.push({ ...workOf(w), views: Number(s.views), shorts: s.shorts });
      groups.set(g, grp);
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, works: g.works.sort((a, b) => b.views - a.views).slice(0, 8) }))
    .sort((a, b) => b.views - a.views);
}

/* ───────────── 편성표 · 시즌·오픈 (TMDB) ───────────── */

type TmdbShow = {
  id: number;
  name: string;
  posterPath: string | null;
  category: WorkCategory;
  networks: string[];
  nextAt: string | null;
  nextEp: string | null;
  lastAt: string | null;
  lastEp: string | null;
  firstAirDate: string | null;
  popularity: number;
};

const kstDate = (d: Date) => new Date(d.getTime() + 9 * H).toISOString().slice(0, 10);

async function tvDetail(id: number): Promise<TmdbShow | null> {
  try {
    const d = await tmdb<any>(`/tv/${id}`);
    const ep = (e: any) => (e ? `S${e.season_number}E${e.episode_number}` : null);
    return {
      id,
      name: d.name,
      posterPath: d.poster_path ?? null,
      category: categoryOf('tv', d),
      networks: (d.networks ?? []).map((n: any) => n.name).slice(0, 3),
      nextAt: d.next_episode_to_air?.air_date ?? null,
      nextEp: ep(d.next_episode_to_air),
      lastAt: d.last_episode_to_air?.air_date ?? null,
      lastEp: ep(d.last_episode_to_air),
      firstAirDate: d.first_air_date ?? null,
      popularity: d.popularity ?? 0,
    };
  } catch {
    return null;
  }
}

/** 이번 주 방영하는 한국 드라마·예능 (TMDB, 6시간 캐시) */
async function airingThisWeek(): Promise<TmdbShow[]> {
  const today = kstDate(new Date());
  const week = kstDate(new Date(Date.now() + 7 * D));
  const { data } = await cached(`radar:airing:${today}`, 6 * H, async () => {
    const ids = new Set<number>();
    for (const page of [1, 2, 3]) {
      const r = await tmdb<{ results?: { id: number }[] }>('/discover/tv', {
        with_origin_country: 'KR',
        'air_date.gte': today,
        'air_date.lte': week,
        sort_by: 'popularity.desc',
        page: String(page),
      });
      for (const x of r.results ?? []) ids.add(x.id);
    }
    const list = [...ids];
    const shows: TmdbShow[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (next < list.length) {
          const s = await tvDetail(list[next++]);
          if (s) shows.push(s);
        }
      })
    );
    return shows;
  });
  return data;
}

type ShortStat = { shorts: number; channels: number; maxViews: number; topId: string | null; topTitle: string | null };

async function shortStatsByTmdb(keys: string[], since: Date): Promise<Map<string, ShortStat>> {
  const out = new Map<string, ShortStat>();
  if (!keys.length) return out;
  const rows = await prisma.$queryRaw<{ wid: string; shorts: number; channels: number; maxv: number; top_id: string; top_title: string }[]>`
    SELECT DISTINCT ON (v."workId") v."workId" AS wid,
      COUNT(*) OVER (PARTITION BY v."workId")::int AS shorts,
      (SELECT COUNT(DISTINCT x."channelId")::int FROM "RadarVideo" x WHERE x."workId" = v."workId" AND x."publishedAt" > ${since}) AS channels,
      MAX(v.views) OVER (PARTITION BY v."workId")::int AS maxv,
      v.id AS top_id, v.title AS top_title
    FROM "RadarVideo" v
    WHERE v."workId" = ANY(${keys}::text[]) AND v."publishedAt" > ${since}
    ORDER BY v."workId", v.views DESC`;
  for (const r of rows) out.set(r.wid, { shorts: r.shorts, channels: r.channels, maxViews: r.maxv, topId: r.top_id, topTitle: r.top_title });
  return out;
}

export type ScheduleDay = { date: string; items: (TmdbShow & ShortStat & { workId: string })[] };

/** 편성표 — 오늘부터 7일, 날짜별 방영 회차와 감시 채널 쇼츠 경쟁 */
export async function getSchedule(): Promise<ScheduleDay[]> {
  const shows = await airingThisWeek();
  const stats = await shortStatsByTmdb(
    shows.map((s) => `tv:${s.id}`),
    new Date(Date.now() - 7 * D)
  );
  const days = new Map<string, ScheduleDay>();
  const today = kstDate(new Date());
  for (const s of shows) {
    const date = s.nextAt && s.nextAt >= today ? s.nextAt : s.lastAt === today ? s.lastAt : null;
    if (!date) continue;
    const st = stats.get(`tv:${s.id}`) ?? { shorts: 0, channels: 0, maxViews: 0, topId: null, topTitle: null };
    const d = days.get(date) ?? { date, items: [] };
    d.items.push({ ...s, ...st, workId: `tv:${s.id}` });
    days.set(date, d);
  }
  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, items: d.items.sort((a, b) => b.popularity - a.popularity) }));
}

export type SeasonItem = TmdbShow & ShortStat & { workId: string; kind: 'new' | 'soon' | 'movie' };

/** 시즌·오픈 — 최근 3주 새로 시작했거나 2주 안에 시작하는 한국 드라마·예능, 최근 한 달 개봉 한국 영화 */
export async function getSeason(): Promise<SeasonItem[]> {
  const today = new Date();
  const from = kstDate(new Date(today.getTime() - 21 * D));
  const to = kstDate(new Date(today.getTime() + 14 * D));
  const movieFrom = kstDate(new Date(today.getTime() - 30 * D));
  const { data } = await cached(`radar:season:${kstDate(today)}`, 6 * H, async () => {
    const out: (TmdbShow & { kind: SeasonItem['kind'] })[] = [];
    const tv = await tmdb<{ results?: any[] }>('/discover/tv', {
      with_origin_country: 'KR',
      'first_air_date.gte': from,
      'first_air_date.lte': to,
      sort_by: 'popularity.desc',
    });
    for (const x of (tv.results ?? []).slice(0, 20)) {
      const s = await tvDetail(x.id);
      if (s) out.push({ ...s, kind: (s.firstAirDate ?? '') > kstDate(today) ? 'soon' : 'new' });
    }
    const mv = await tmdb<{ results?: any[] }>('/discover/movie', {
      with_origin_country: 'KR',
      'primary_release_date.gte': movieFrom,
      'primary_release_date.lte': to,
      sort_by: 'popularity.desc',
    });
    for (const x of (mv.results ?? []).slice(0, 12)) {
      out.push({
        id: x.id,
        name: x.title,
        posterPath: x.poster_path ?? null,
        category: 'kr_movie',
        networks: [],
        nextAt: null,
        nextEp: null,
        lastAt: null,
        lastEp: null,
        firstAirDate: x.release_date ?? null,
        popularity: x.popularity ?? 0,
        kind: 'movie',
      });
    }
    return out;
  });
  const keys = data.map((s) => (s.kind === 'movie' ? `movie:${s.id}` : `tv:${s.id}`));
  const stats = await shortStatsByTmdb(keys, new Date(Date.now() - 30 * D));
  return data.map((s, i) => ({
    ...s,
    ...(stats.get(keys[i]) ?? { shorts: 0, channels: 0, maxViews: 0, topId: null, topTitle: null }),
    workId: keys[i],
  }));
}

/* ───────────── 황금키워드 ───────────── */

export type GoldenRow = {
  keyword: string;
  kind: 'work' | 'person';
  /** 네이버 월간 검색수 (PC+모바일), 키가 없거나 데이터가 없으면 null */
  volume: number | null;
  shorts7d: number;
  channels7d: number;
  /** 검색수 ÷ (쇼츠 수 + 1) — 클수록 찾는 사람은 많은데 만드는 사람은 적다 */
  score: number | null;
};

export async function getGolden(): Promise<{ rows: GoldenRow[]; enabled: boolean }> {
  const works = await prisma.$queryRaw<{ wid: string; title: string; shorts: number; channels: number; cast: unknown }[]>`
    SELECT w.id AS wid, w.title, w.cast,
      COUNT(v.id) FILTER (WHERE v."publishedAt" > NOW() - INTERVAL '7 days')::int AS shorts,
      COUNT(DISTINCT v."channelId") FILTER (WHERE v."publishedAt" > NOW() - INTERVAL '7 days')::int AS channels
    FROM "RadarWork" w JOIN "RadarVideo" v ON v."workId" = w.id
    WHERE v."publishedAt" > NOW() - INTERVAL '30 days'
    GROUP BY w.id ORDER BY SUM(v.views) DESC LIMIT 60`;
  const people = new Map<string, { shorts: number; channels: number }>();
  for (const w of works) {
    for (const c of ((w.cast as { name: string; order: number }[]) ?? []).filter((c) => c.order < 3)) {
      const p = people.get(c.name) ?? { shorts: 0, channels: 0 };
      p.shorts += w.shorts;
      p.channels = Math.max(p.channels, w.channels);
      people.set(c.name, p);
    }
  }
  const candidates: Omit<GoldenRow, 'volume' | 'score'>[] = [
    ...works.map((w) => ({ keyword: w.title, kind: 'work' as const, shorts7d: w.shorts, channels7d: w.channels })),
    ...[...people.entries()].slice(0, 60).map(([name, p]) => ({ keyword: name, kind: 'person' as const, shorts7d: p.shorts, channels7d: p.channels })),
  ];
  const { map, enabled } = await getVolumes(candidates.map((c) => c.keyword));
  const rows = candidates.map((c) => {
    const v = map[volumeKey(c.keyword)];
    const volume = v ? v.total : null;
    return { ...c, volume, score: volume != null ? Math.round(volume / (c.shorts7d + 1)) : null };
  });
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { rows, enabled };
}

/* ───────────── 속도전 ───────────── */

export type SpeedRow = {
  work: MiniWork;
  episodeDate: string;
  /** 회차 방송일 이후 올라온 쇼츠 (빠른 순) — 방송일 0시(KST)부터 몇 시간 뒤인지 */
  uploads: (MiniVideo & { hoursAfter: number })[];
  /** 방송 다음 날까지 올린 쇼츠 평균 조회 vs 그 뒤 */
  earlyAvg: number | null;
  lateAvg: number | null;
};

/** 방영 중 작품의 최근 회차 뒤 누가 얼마나 빨리 올렸고, 빨리 올린 게 더 나왔는지 */
export async function getSpeed(): Promise<SpeedRow[]> {
  const works = await prisma.radarWork.findMany({
    where: { lastEpisodeAt: { gt: new Date(Date.now() - 10 * D) } },
    orderBy: { popularity: 'desc' },
    take: 30,
  });
  const out: SpeedRow[] = [];
  for (const w of works) {
    const epStart = new Date(w.lastEpisodeAt!.getTime() - 9 * H); // 방송일 0시 KST
    const rows = await prisma.$queryRaw<VRow[]>`
      SELECT v.id, v.title, v.views, v."publishedAt", COALESCE(c."displayName", c."externalId") AS channel, v."isShorts", v."workId"
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."workId" = ${w.id} AND v."publishedAt" >= ${epStart} AND v."publishedAt" < ${new Date(epStart.getTime() + 7 * D)}
      ORDER BY v."publishedAt" ASC LIMIT 30`;
    if (!rows.length) continue;
    const early = rows.filter((r) => r.publishedAt.getTime() - epStart.getTime() < 48 * H);
    const late = rows.filter((r) => r.publishedAt.getTime() - epStart.getTime() >= 48 * H);
    const avg = (xs: VRow[]) => (xs.length ? Math.round(xs.reduce((a, x) => a + x.views, 0) / xs.length) : null);
    out.push({
      work: workOf(w),
      episodeDate: kstDate(w.lastEpisodeAt!),
      uploads: rows.slice(0, 6).map((r) => ({ ...vid(r), hoursAfter: Math.round((r.publishedAt.getTime() - epStart.getTime()) / H) })),
      earlyAvg: avg(early),
      lateAvg: avg(late),
    });
  }
  return out;
}

/* ───────────── 시상식 ───────────── */

const AWARD_RE =
  '(시상식|연기대상|연예대상|가요대전|가요대제전|가요대축제|백상|청룡|대종상|골든디스크|마마어워즈|mama|멜론뮤직어워드|mma|aaa|서울가요대상|아카데미|오스카|골든글로브|에미상|레드카펫|수상소감)';

/** 해마다 대략 이맘때 — 시상식 클립이 몰리는 달 */
export const AWARD_CALENDAR: { month: number; names: string }[] = [
  { month: 1, names: '골든디스크 · 서울가요대상' },
  { month: 5, names: '백상예술대상' },
  { month: 10, names: '부일영화상' },
  { month: 11, names: '청룡영화상 · 대종상 · MAMA · 멜론뮤직어워드' },
  { month: 12, names: 'KBS·MBC·SBS 연기대상 · 연예대상 · 가요대전/가요대제전/가요대축제 · AAA' },
];

export async function getAwards(): Promise<{ recent: MiniVideo[]; past: (MiniVideo & { folder: string | null })[] }> {
  const recent = await prisma.$queryRaw<VRow[]>`
    SELECT v.id, v.title, v.views, v."publishedAt", COALESCE(c."displayName", c."externalId") AS channel, v."isShorts", v."workId"
    FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
    WHERE (v.title ~* ${AWARD_RE} OR array_to_string(v.tags, ' ') ~* ${AWARD_RE})
    ORDER BY v.views DESC LIMIT 30`;
  const past = await prisma.$queryRaw<(VRow & { folder: string | null })[]>`
    SELECT id, title, views, "publishedAt", COALESCE("channelName", "channelExternalId") AS channel, "isShorts", "workId", folder
    FROM "PastHit"
    WHERE title ~* ${AWARD_RE} OR array_to_string(tags, ' ') ~* ${AWARD_RE}
    ORDER BY views DESC LIMIT 40`;
  return { recent: recent.map(vid), past: past.map((p) => ({ ...vid(p), folder: p.folder })) };
}

/* ───────────── 과거 트래픽: 작년 이맘때 ───────────── */

/** 지난해들의 같은 시기(앞뒤 2주)에 올라와 100만+ 나온 영상 — 터졌던 게 또 터진다 */
export async function getSameSeasonPast(limit = 12): Promise<(MiniVideo & { folder: string | null })[]> {
  const rows = await prisma.$queryRaw<(VRow & { folder: string | null })[]>`
    SELECT id, title, views, "publishedAt", COALESCE("channelName", "channelExternalId") AS channel, "isShorts", "workId", folder
    FROM "PastHit"
    WHERE "publishedAt" < NOW() - INTERVAL '300 days'
      AND ABS(EXTRACT(DOY FROM "publishedAt") - EXTRACT(DOY FROM NOW())) <= 14
    ORDER BY views DESC LIMIT ${limit}`;
  return rows.map((p) => ({ ...vid(p), folder: p.folder }));
}
