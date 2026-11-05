/**
 * 꿀통레이더 AI 브리핑 — 지금 트래픽 타는 인물·작품을 Claude 가 분석한다.
 *
 *  모으는 것 (AI 없이):
 *   - 우리 유튜브 수치: 최근 3일 영상에서 뜨는 인물(해시태그·태그의 TMDB 인물) · 뜨는 작품(작품 인식)
 *   - TMDB: 인물 출연작 · 작품 출연진 · 그 배우의 다른 작품 · 작품 추천(비슷한 작품)
 *   - 구글 급상승 검색어(최근 24시간) · 구글 뉴스 최근 기사 제목
 *  Claude 는 이걸 묶어서: 왜 뜨나 → 관련 작품 → 같은 결 작품 · 같은 배우 작품 → 쇼츠 기획 · 주의점
 *  결과는 TrendCache 'radar:brief' 에 남겨 두고 화면이 읽는다. 버튼을 눌러야 새로 만든다 (호출마다 비용).
 */

import { prisma } from '@/lib/db';
import { googleTrending } from '@/lib/trends/google';
import { askClaude, hasClaudeKey, NoClaudeKeyError } from './claude';
import { STOP_TOKENS } from './discover';

export { NoClaudeKeyError };
import { categoryOutlook, type PackOutlook } from './outlook';
import type { PersonCredit } from './match';
import { AWARD_CALENDAR, getSameSeasonPast, getSchedule } from './tabs';
import { tmdb } from './tmdb';


/** 인물 이름처럼 잡히지만 일반 단어인 것 */
const NOT_PERSON = new Set(['남자', '여자', 'ott', 'yg', 'sm', 'jyp', 'hybe', '지수', '아빠', '엄마', '할머니', '할아버지']);

/* ───────────── 자료 모으기 ───────────── */

type NewsItem = { title: string; source: string; date: string; link: string };

export type BriefPersonInput = {
  name: string;
  channels: number;
  videos: number;
  gain24h: number;
  topVideos: { title: string; views: number }[];
  packs: string[];
  filmography: { title: string; year: string | null; kind: string; role: string | null }[];
  news: NewsItem[];
};

export type BriefWorkInput = {
  title: string;
  year: string | null;
  kind: string;
  networks: string[];
  onAir: boolean;
  channels: number;
  videos: number;
  gain24h: number;
  topVideos: { title: string; views: number }[];
  cast: { name: string; role: string | null; otherWorks: string[] }[];
  tmdbSimilar: { title: string; year: string | null }[];
  news: NewsItem[];
};

export type BriefPackInput = {
  pack: string;
  channels: number;
  /** 팩 채널들의 어제 하루 조회수 합 · 그 전날 */
  dailyViews: number;
  dailyViewsPrev: number;
  growthPct: number | null;
  /** 최근 48시간 새 영상 수 · 그 영상들의 최근 24시간 조회 증가 */
  newVideos48h: number;
  gain24h: number;
  topVideos: { title: string; views: number }[];
};

export type BriefInput = {
  today: string;
  packs: BriefPackInput[];
  /** 카테고리 기회판 — 1주 흐름·영상당 조회·신생 성공·쏠림으로 매긴 기회 점수 (상위·하위) */
  outlook: PackOutlook[];
  keywords: { word: string; gain24h: number; channels: number; videos: number; videosWeekAgo: number }[];
  persons: BriefPersonInput[];
  works: BriefWorkInput[];
  google: { query: string; volume: number; related: string[] }[];
  season: { awardsThisMonth: string | null; awardsNextMonth: string | null; pastSameSeason: { title: string; views: number; year: string; pack: string | null }[] };
  thisWeek: { date: string; title: string; ep: string | null; networks: string[] }[];
  upcoming: { title: string; platform: string; date: string | null; kind: string }[];
};

/** 주제가 아니라 규모·성격으로 묶은 팩 — 카테고리 분석에서 뺀다 */
const META_PACKS = new Set(['넘사', '고래', 'No양산형', '주제 자주 변경', '제외', '대기업', '방송사 채널팩', '뉴스공식', '저작권ㄱㅊ?']);

const KIND: Record<string, string> = {
  kr_drama: '한국 드라마',
  kr_movie: '한국 영화',
  kr_variety: '한국 예능',
  intl_drama: '해외 드라마',
  intl_movie: '해외 영화',
  intl_variety: '해외 예능',
};

/** 구글 뉴스 RSS — 최근 3일 기사 제목 (키 없이) */
async function googleNews(q: string, n = 5): Promise<NewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:3d')}&hl=ko&gl=KR&ceid=KR:ko`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split('<item>').slice(1, n + 1);
    const tag = (s: string, t: string) =>
      (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? '')
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    return items.map((s) => {
      const source = tag(s, 'source');
      const title = tag(s, 'title').replace(new RegExp(`\\s*-\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
      return { title, source, date: tag(s, 'pubDate'), link: tag(s, 'link') };
    });
  } catch {
    return [];
  }
}

/** TMDB 추천(비슷한 작품) — 3일 캐시 */
async function similarWorks(mediaType: string, tmdbId: number): Promise<{ title: string; year: string | null }[]> {
  const key = `tmdb:rec:${mediaType}:${tmdbId}`;
  const c = await prisma.trendCache.findUnique({ where: { key } }).catch(() => null);
  if (c && Date.now() - c.fetchedAt.getTime() < 3 * 86_400_000) return c.payload as { title: string; year: string | null }[];
  try {
    const r = await tmdb<{ results?: any[] }>(`/${mediaType}/${tmdbId}/recommendations`);
    const out = (r.results ?? []).slice(0, 8).map((x) => ({
      title: (x.name || x.title || '').trim(),
      year: (x.first_air_date || x.release_date || '').slice(0, 4) || null,
    }));
    await prisma.trendCache.upsert({ where: { key }, create: { key, payload: out }, update: { payload: out, fetchedAt: new Date() } }).catch(() => {});
    return out;
  } catch {
    return [];
  }
}

/** 채널팩 열기 — 어제 하루 조회수(전날 대비)와 최근 48시간 새 영상의 조회 증가 */
async function packHeat(): Promise<BriefPackInput[]> {
  const rows = await prisma.$queryRaw<{ folderId: string; name: string; ch: number; d: number | null; dp: number | null; n48: number | null; g24: number | null }[]>`
    WITH ch AS (
      SELECT "folderId", COUNT(*)::int AS ch, SUM("dailyViews")::float8 AS d, SUM("dailyViewsPrev")::float8 AS dp
      FROM "Channel" WHERE "isActive" AND platform = 'YOUTUBE' GROUP BY 1
    ), v AS (
      SELECT c."folderId", COUNT(*)::int AS n48, SUM(COALESCE(v."gain24h", 0))::float8 AS g24
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."publishedAt" > NOW() - INTERVAL '48 hours' GROUP BY 1
    )
    SELECT f.id AS "folderId", f.name, ch.ch, ch.d, ch.dp, v.n48, v.g24
    FROM "Folder" f JOIN ch ON ch."folderId" = f.id LEFT JOIN v ON v."folderId" = f.id
    WHERE ch.ch >= 5`;
  const use = rows.filter((r) => !META_PACKS.has(r.name) && !r.name.startsWith('__'));
  // 오른 팩 + 내린 팩 몇 개 (조회 증가 순 상위 22개 + 전날 대비 가장 많이 빠진 4개)
  const byGain = [...use].sort((a, b) => (b.g24 ?? 0) - (a.g24 ?? 0)).slice(0, 22);
  const growth = (r: (typeof use)[number]) => (r.d && r.dp ? r.d / r.dp - 1 : null);
  const falling = use
    .filter((r) => !byGain.includes(r) && (r.d ?? 0) > 100_000 && (growth(r) ?? 0) < -0.15)
    .sort((a, b) => (growth(a) ?? 0) - (growth(b) ?? 0))
    .slice(0, 4);
  const pick = [...byGain, ...falling];
  const tops = await prisma.$queryRaw<{ folderId: string; title: string; views: number }[]>`
    SELECT "folderId", title, views FROM (
      SELECT c."folderId", v.title, v.views, ROW_NUMBER() OVER (PARTITION BY c."folderId" ORDER BY v."gain24h" DESC NULLS LAST) AS rn
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."publishedAt" > NOW() - INTERVAL '48 hours' AND c."folderId" = ANY(${pick.map((p) => p.folderId)}::text[])
    ) x WHERE rn <= 2`;
  return pick.map((r) => ({
    pack: r.name,
    channels: r.ch,
    dailyViews: Math.round(r.d ?? 0),
    dailyViewsPrev: Math.round(r.dp ?? 0),
    growthPct: growth(r) == null ? null : Math.round(growth(r)! * 100),
    newVideos48h: r.n48 ?? 0,
    gain24h: Math.round(r.g24 ?? 0),
    topVideos: tops.filter((t) => t.folderId === r.folderId).map((t) => ({ title: t.title, views: t.views })),
  }));
}

/** 뜨는 키워드 — 최근 48시간 해시태그·태그를 조회 증가로 무게 (네 채널 이상), 일주일 전 같은 이틀과 비교 */
export async function hotKeywords(): Promise<BriefInput["keywords"]> {
  const rows = await prisma.$queryRaw<{ w: string; g24: number; ch: number; n: number; prev: number }[]>`
    WITH t AS (
      SELECT DISTINCT v.id, v."channelId", COALESCE(v."gain24h", 0) AS g, (v."publishedAt" > NOW() - INTERVAL '48 hours') AS cur,
        lower(regexp_replace(tok, '[[:space:][:punct:]]', '', 'g')) AS w
      FROM "RadarVideo" v,
        unnest(v.tags || COALESCE((SELECT array_agg(m[1]) FROM regexp_matches(v.title, '#([^\s#]+)', 'g') m), '{}')) tok
      WHERE v."publishedAt" > NOW() - INTERVAL '48 hours'
         OR v."publishedAt" BETWEEN NOW() - INTERVAL '9 days' AND NOW() - INTERVAL '7 days'
    )
    SELECT w, (SUM(g) FILTER (WHERE cur))::float8 AS g24, (COUNT(DISTINCT "channelId") FILTER (WHERE cur))::int AS ch,
      (COUNT(*) FILTER (WHERE cur))::int AS n, (COUNT(*) FILTER (WHERE NOT cur))::int AS prev
    FROM t WHERE length(w) BETWEEN 2 AND 20 AND w !~ '^[0-9]+$'
    GROUP BY w HAVING COUNT(DISTINCT "channelId") FILTER (WHERE cur) >= 4
    ORDER BY 2 DESC NULLS LAST LIMIT 120`;
  return rows
    .filter((r) => !STOP_TOKENS.has(r.w) && !/^(shorts?|쇼츠|숏츠|short|kpop|kdrama|드라마|영화|예능|유머|웃긴영상|reels?|news|뉴스|funny|viral|fyp|trending|youtube|유튜브)$/.test(r.w))
    .slice(0, 40)
    .map((r) => ({ word: r.w, gain24h: Math.round(r.g24 ?? 0), channels: r.ch, videos: r.n, videosWeekAgo: r.prev }));
}

/** 공개 예정 — 45일 안 한국 드라마·예능, 넷플릭스 시리즈, 한국 개봉 영화 (12시간 캐시) */
async function upcomingReleases(): Promise<BriefInput['upcoming']> {
  const day = (d: Date) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const from = day(new Date(Date.now() - 3 * 86_400_000));
  const to = day(new Date(Date.now() + 45 * 86_400_000));
  const key = `radar:upcoming:${day(new Date())}`;
  const c = await prisma.trendCache.findUnique({ where: { key } }).catch(() => null);
  if (c && Date.now() - c.fetchedAt.getTime() < 12 * 3_600_000) return c.payload as BriefInput['upcoming'];
  const safe = <T>(p: Promise<T>, fb: T) => p.catch(() => fb);
  const [krTv, netflix, krMovie] = await Promise.all([
    safe(tmdb<{ results?: any[] }>('/discover/tv', { with_origin_country: 'KR', 'first_air_date.gte': from, 'first_air_date.lte': to, sort_by: 'popularity.desc' }), {}),
    safe(tmdb<{ results?: any[] }>('/discover/tv', { with_networks: '213', 'first_air_date.gte': from, 'first_air_date.lte': to, sort_by: 'popularity.desc' }), {}),
    safe(tmdb<{ results?: any[] }>('/discover/movie', { region: 'KR', 'primary_release_date.gte': from, 'primary_release_date.lte': to, sort_by: 'popularity.desc', with_release_type: '2|3' }), {}),
  ]);
  const tvItems = [...(krTv.results ?? []).slice(0, 18), ...(netflix.results ?? []).slice(0, 12)];
  const seen = new Set<number>();
  const tv = tvItems.filter((x) => !seen.has(x.id) && seen.add(x.id));
  // 방송사·OTT 이름은 상세에서
  const details = await Promise.all(tv.map((x) => safe(tmdb<{ networks?: { name: string }[]; genres?: { id: number }[] }>(`/tv/${x.id}`), {})));
  const out: BriefInput['upcoming'] = [
    ...tv.map((x, i) => {
      const nets = (details[i].networks ?? []).map((n) => n.name);
      const variety = (x.genre_ids ?? []).some((g: number) => g === 10764 || g === 10767);
      return {
        title: (x.name || '').trim(),
        platform: nets.join(', ') || ((netflix.results ?? []).some((n: any) => n.id === x.id) ? 'Netflix' : ''),
        date: x.first_air_date || null,
        kind: (x.origin_country ?? []).includes('KR') ? (variety ? '한국 예능' : '한국 드라마') : variety ? '해외 예능' : '해외 시리즈',
      };
    }),
    ...(krMovie.results ?? []).slice(0, 10).map((x: any) => ({ title: (x.title || '').trim(), platform: '극장', date: x.release_date || null, kind: x.original_language === 'ko' ? '한국 영화' : '해외 영화' })),
  ].filter((x) => x.title);
  await prisma.trendCache.upsert({ where: { key }, create: { key, payload: out }, update: { payload: out, fetchedAt: new Date() } }).catch(() => {});
  return out;
}

export async function gatherBriefInput(): Promise<BriefInput> {
  // 1. 뜨는 인물 — 최근 3일 영상의 해시태그·태그가 가리키는 TMDB 인물, 세 채널 이상
  const persons = await prisma.$queryRaw<
    { id: number; name: string; videos: number; channels: number; g24: number; packs: string[]; credits: PersonCredit[] }[]
  >`
    WITH v AS (
      SELECT v.id, v."channelId", c."folderId", COALESCE(v."gain24h", 0) AS g24,
        ARRAY(SELECT DISTINCT lower(regexp_replace(t, '[[:space:][:punct:]]', '', 'g'))
              FROM unnest(v.tags || COALESCE((SELECT array_agg(m[1]) FROM regexp_matches(v.title, '#([^\\s#]+)', 'g') m), '{}')) t) AS toks
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."publishedAt" > NOW() - INTERVAL '3 days'
    ), hit AS (
      SELECT DISTINCT p.id, v.id AS vid, v."channelId", v."folderId", v.g24
      FROM v CROSS JOIN unnest(v.toks) tok
      JOIN "RadarAlias" a ON a.alias = tok AND a."personId" IS NOT NULL AND NOT a.blocked
      JOIN "RadarPerson" p ON p.id = a."personId"
    )
    SELECT p.id, p.name, COUNT(DISTINCT h.vid)::int AS videos, COUNT(DISTINCT h."channelId")::int AS channels,
      SUM(h.g24)::float8 AS g24,
      ARRAY(SELECT DISTINCT f.name FROM "Folder" f WHERE f.id = ANY(array_agg(h."folderId"))) AS packs,
      p.credits
    FROM hit h JOIN "RadarPerson" p ON p.id = h.id
    GROUP BY p.id, p.name, p.credits
    HAVING COUNT(DISTINCT h."channelId") >= 3
    ORDER BY SUM(h.g24) DESC
    LIMIT 25`;
  const topPersons = persons.filter((p) => p.name.trim().length >= 2 && !NOT_PERSON.has(p.name.trim().toLowerCase())).slice(0, 10);

  // 2. 뜨는 작품 — 최근 3일, 세 채널 이상
  const works = await prisma.$queryRaw<
    { id: string; tmdbId: number; mediaType: string; title: string; year: string | null; category: string; networks: string[]; onAir: boolean; cast: { name?: string; character?: string | null; order?: number }[]; videos: number; channels: number; g24: number }[]
  >`
    SELECT w.id, w."tmdbId", w."mediaType", w.title, w.year, w.category, w.networks, w."onAir", w.cast,
      COUNT(*)::int AS videos, COUNT(DISTINCT v."channelId")::int AS channels, SUM(COALESCE(v."gain24h", 0))::float8 AS g24
    FROM "RadarVideo" v JOIN "RadarWork" w ON w.id = v."workId"
    WHERE v."publishedAt" > NOW() - INTERVAL '3 days'
    GROUP BY w.id
    HAVING COUNT(DISTINCT v."channelId") >= 3
    ORDER BY SUM(COALESCE(v."gain24h", 0)) DESC
    LIMIT 8`;

  // 영상 제목 (인물·작품별 상위 3개)
  const topVideosByWork = await prisma.$queryRaw<{ workId: string; title: string; views: number }[]>`
    SELECT "workId", title, views FROM (
      SELECT v."workId", v.title, v.views, ROW_NUMBER() OVER (PARTITION BY v."workId" ORDER BY v.views DESC) AS rn
      FROM "RadarVideo" v WHERE v."publishedAt" > NOW() - INTERVAL '3 days' AND v."workId" = ANY(${works.map((w) => w.id)}::text[])
    ) x WHERE rn <= 3`;
  const personVideos = await Promise.all(
    topPersons.map((p) =>
      prisma.$queryRaw<{ title: string; views: number }[]>`
        SELECT title, views FROM "RadarVideo"
        WHERE "publishedAt" > NOW() - INTERVAL '3 days' AND (title ILIKE ${'%' + p.name + '%'} OR ${p.name} = ANY(tags))
        ORDER BY views DESC LIMIT 3`
    )
  );

  // 출연진의 다른 작품 (우리가 받아 둔 TMDB 출연작)
  const castNames = [...new Set(works.flatMap((w) => (w.cast ?? []).filter((c) => (c.order ?? 9) < 5 && c.name).map((c) => c.name!)))];
  const castCredits = castNames.length
    ? await prisma.radarPerson.findMany({ where: { name: { in: castNames } }, select: { name: true, credits: true } })
    : [];
  const creditsBy = new Map(castCredits.map((c) => [c.name, (c.credits as unknown as PersonCredit[]) ?? []]));

  const month = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }));
  const [outlookAll, packs, keywords, pastSame, schedule, upcoming] = await Promise.all([
    categoryOutlook().catch(() => [] as PackOutlook[]),
    packHeat(),
    hotKeywords(),
    getSameSeasonPast(15).catch(() => []),
    getSchedule().catch(() => []),
    upcomingReleases().catch(() => []),
  ]);

  const [similar, personNews, workNews, google] = await Promise.all([
    Promise.all(works.map((w) => similarWorks(w.mediaType, w.tmdbId))),
    Promise.all(topPersons.map((p) => googleNews(p.name))),
    Promise.all(works.map((w) => googleNews(w.title.split(':')[0]))),
    googleTrending(24)
      .then((r) => r.data)
      .catch(() => []),
  ]);

  return {
    today: new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
    packs,
    outlook: [...outlookAll.slice(0, 20), ...outlookAll.slice(-5)].filter((x, i, a) => a.indexOf(x) === i),
    keywords,
    season: {
      awardsThisMonth: AWARD_CALENDAR.find((a) => a.month === month)?.names ?? null,
      awardsNextMonth: AWARD_CALENDAR.find((a) => a.month === (month % 12) + 1)?.names ?? null,
      pastSameSeason: pastSame.map((p) => ({ title: p.title, views: p.views, year: p.publishedAt.slice(0, 4), pack: p.folder })),
    },
    thisWeek: schedule
      .flatMap((d) => d.items.map((it) => ({ date: d.date, title: it.name, ep: it.nextEp ?? it.lastEp, networks: it.networks, pop: it.popularity })))
      .sort((a, b) => b.pop - a.pop)
      .slice(0, 20)
      .map(({ pop: _pop, ...x }) => x),
    upcoming,
    persons: topPersons.map((p, i) => ({
      name: p.name,
      channels: p.channels,
      videos: p.videos,
      gain24h: Math.round(p.g24),
      topVideos: personVideos[i],
      packs: p.packs.slice(0, 6),
      filmography: (p.credits ?? [])
        .slice()
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 8)
        .map((c) => ({ title: c.title, year: c.year, kind: KIND[c.category] ?? c.category, role: c.character })),
      news: personNews[i],
    })),
    works: works.map((w, i) => ({
      title: w.title,
      year: w.year,
      kind: KIND[w.category] ?? w.category,
      networks: w.networks,
      onAir: w.onAir,
      channels: w.channels,
      videos: w.videos,
      gain24h: Math.round(w.g24),
      topVideos: topVideosByWork.filter((v) => v.workId === w.id).map((v) => ({ title: v.title, views: v.views })),
      cast: (w.cast ?? [])
        .filter((c) => (c.order ?? 9) < 5 && c.name)
        .map((c) => ({
          name: c.name!,
          role: c.character ?? null,
          otherWorks: (creditsBy.get(c.name!) ?? [])
            .filter((x) => x.workId !== w.id)
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, 4)
            .map((x) => `${x.title}${x.year ? ` (${x.year})` : ''}`),
        })),
      tmdbSimilar: similar[i],
      news: workNews[i],
    })),
    google: (google as { query: string; volume: number; related: string[] }[])
      .slice(0, 30)
      .map((g) => ({ query: g.query, volume: g.volume, related: g.related.slice(0, 4) })),
  };
}

/* ───────────── Claude 분석 ───────────── */

const IDEA = {
  type: 'array',
  description: '바로 찍을 수 있는 쇼츠 기획 2~3개 — 제목 한 줄 + (어떤 장면·자료로)',
  items: { type: 'string' },
} as const;
const PICK = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'reason'],
  properties: { title: { type: 'string' }, reason: { type: 'string', description: '왜 지금 같이 뜰 만한가 (한 문장)' } },
} as const;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'promising', 'categories', 'keywords', 'persons', 'works', 'season', 'upcoming', 'googleOpportunities'],
  properties: {
    headline: { type: 'string', description: '오늘 판을 두세 문장으로 — 어느 카테고리·소재가 왜 뜨나' },
    promising: {
      type: 'array',
      description: '지금 들어가기 유망한 카테고리 3~5개 — 기회판(outlook) 점수와 근거를 보고, 수요가 오르는데 영상당 조회가 좋고 신생도 먹히며 쏠림이 덜한 곳',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pack', 'verdict', 'why', 'entry', 'risk'],
        properties: {
          pack: { type: 'string' },
          verdict: { type: 'string', enum: ['강력 추천', '추천', '지켜보기'] },
          why: { type: 'string', description: '수치 근거: 채널 오름세·오른 채널 비율 · 채널 성과 · 영상당 몫 · 신생 성공률 · 쏠림, 잘 나온 채널·대박 신생 이름' },
          entry: { type: 'string', description: '새 채널로 들어간다면 어떤 결·포맷으로 (예: 쇼츠, 소재, 업로드 빈도)' },
          risk: { type: 'string', description: '저작권·포화·일시 유행 등 위험' },
        },
      },
    },
    categories: {
      type: 'array',
      description: '채널팩(카테고리) 흐름 5~8개 — 뜨는 것 위주, 꺼지는 것도 있으면',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pack', 'trend', 'why', 'angle'],
        properties: {
          pack: { type: 'string' },
          trend: { type: 'string', enum: ['상승', '유지', '하락'] },
          why: { type: 'string', description: '수치 근거(전날 대비·새 영상 조회 증가)와 원인' },
          angle: { type: 'string', description: '이 카테고리에서 지금 만들 것' },
        },
      },
    },
    keywords: {
      type: 'array',
      description: '지금 뜨는 키워드 5~8개 — 일주일 전보다 늘어난 것 우선',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['keyword', 'why', 'angle'],
        properties: { keyword: { type: 'string' }, why: { type: 'string' }, angle: { type: 'string', description: '쇼츠로 어떻게 탈지' } },
      },
    },
    persons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'heat', 'why', 'evidence', 'relatedWorks', 'ideas', 'caution'],
        properties: {
          name: { type: 'string' },
          heat: { type: 'string', enum: ['상승', '정점', '식는 중'] },
          why: { type: 'string', description: '왜 지금 뜨나 (기사·구글·유튜브 근거로)' },
          evidence: { type: 'array', items: { type: 'string' }, description: '근거 2~4개 (유튜브 수치 · 구글 급상승 · 기사 제목)' },
          relatedWorks: { type: 'array', items: PICK, description: '이 인물로 같이 탈 작품 2~4개 (출연작·화제작)' },
          ideas: IDEA,
          caution: { type: 'string', description: '추모·정치·논란·저작권 등 주의점. 없으면 빈 문자열' },
        },
      },
    },
    works: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why', 'evidence', 'sameTone', 'sameActor', 'ideas', 'caution'],
        properties: {
          title: { type: 'string' },
          why: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          sameTone: { type: 'array', items: PICK, description: '결이 맞는 다른 작품 2~4개 (장르·정서·소재)' },
          sameActor: {
            type: 'array',
            description: '같은 배우의 다른 작품 2~4개',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['actor', 'title', 'reason'],
              properties: { actor: { type: 'string' }, title: { type: 'string' }, reason: { type: 'string' } },
            },
          },
          ideas: IDEA,
          caution: { type: 'string' },
        },
      },
    },
    season: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'ideas'],
      properties: {
        summary: { type: 'string', description: '지금 계절·시기(날씨·명절·시험·연말·시상식 등)가 쇼츠 소재에 주는 영향, 작년 이맘때 터진 것' },
        ideas: { type: 'array', items: { type: 'string' }, description: '계절 소재 쇼츠 기획 2~4개' },
      },
    },
    upcoming: {
      type: 'array',
      description: '미리 준비할 공개 예정·막 시작한 작품 4~8개 (드라마·예능·넷플릭스·영화)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'platform', 'when', 'why', 'prep'],
        properties: {
          title: { type: 'string' },
          platform: { type: 'string' },
          when: { type: 'string', description: '공개일 또는 방영 상황' },
          why: { type: 'string', description: '왜 뜰 것 같나 (출연진·장르·화제성)' },
          prep: { type: 'string', description: '지금 미리 준비할 것 (출연진 전작 클립·예고편 반응 등)' },
        },
      },
    },
    googleOpportunities: {
      type: 'array',
      description: '구글 급상승인데 우리 유튜브 데이터엔 아직 약한 소재 3~6개 — 선점 기회',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['query', 'angle'],
        properties: { query: { type: 'string' }, angle: { type: 'string', description: '쇼츠로 어떻게 탈지' } },
      },
    },
  },
} as const;

const SYSTEM = `너는 한국 유튜브 쇼츠 채널 운영자를 돕는 트렌드 분석가다. 운영자는 드라마·영화·예능 클립, 연예 이슈, 시니어 타깃 쇼츠를 만든다.
입력 자료:
(1) 감시 중인 유튜브 채널 수만 곳(채널팩=카테고리별)의 수치 — 팩별 어제 하루 조회수와 전날 대비, 최근 48시간 새 영상의 조회 증가, 뜨는 해시태그(일주일 전 같은 이틀과 비교), 인물·작품별 채널 수·영상 수·24시간 조회 증가·상위 영상 제목
(2) 구글 급상승 검색어(최근 24시간)와 구글 뉴스 최근 기사 제목
(3) TMDB 출연작·추천작, 이번 주 방영 편성, 45일 안 공개 예정작(한국 드라마·예능, 넷플릭스 시리즈, 개봉 영화)
(4) 오늘 날짜, 이번 달·다음 달 시상식, 작년 이맘때 터진 영상(조회 100만+)

할 일:
- 유망 카테고리: 기회판(outlook)을 보고 지금 떡상 중이고 새 채널이 들어가도 먹힐 카테고리를 고른다. 점수만 따르지 말고 채널 단위 오름세(growthPct, 채널별 증가율 중앙값)·오른 채널 비율(risingPct), 채널 성과(channelMedianViews), 영상당 몫(viewsPerUpload, 공급 대비 수요), 신생 성공률(youngSuccess/youngChannels)·대박 신생 수, 상위 3채널 쏠림(top3SharePct)을 함께 따진다. 상위 팩의 hot(최근 잘 나온 채널)·rookieList(대박 신생)를 근거로 이름을 들어 설명한다. reuseRisk 가 true 면 저작권 위험을 risk 에 적는다.
- 카테고리(채널팩) 흐름: 어느 팩이 뜨고 꺼지는지 수치로 짚고 원인과 지금 만들 것을 낸다.
- 키워드: 일주일 전보다 확 늘어난 해시태그 위주로 왜 뜨는지와 탈 방법.
- 인물마다 왜 지금 뜨는지 기사·구글·유튜브 근거를 엮어 설명하고, 이 인물로 같이 탈 작품(출연작·화제작)과 쇼츠 기획을 낸다.
- 작품마다 왜 뜨는지, 결이 맞는 다른 작품(장르·정서·소재가 닮은 것), 같은 배우의 다른 작품, 쇼츠 기획을 낸다.
- 계절: 오늘 날짜 기준 시기(날씨·명절·수능·연말·시상식 등)와 작년 이맘때 터진 영상을 엮어 계절 소재를 낸다.
- 공개 예정: 곧 공개되거나 막 시작한 작품 중 뜰 것을 골라, 지금 미리 준비할 것을 낸다.
- 구글 급상승 중 유튜브 데이터에 아직 약한 소재를 골라 선점 기회로 낸다.

규칙:
- 사실(사건·수치·날짜)은 입력 자료에 있는 것만 쓴다. 기사에 없는 사건을 지어내지 않는다. 확신이 없으면 "기사로 확인 필요"라고 쓴다.
- 결 맞는 작품·같은 배우 작품은 입력의 TMDB 출연작·추천작을 우선 쓰고, 네 지식으로 보탤 때도 실제로 있는 작품만 쓴다.
- 인물 이름이 일반 단어거나 동명이인으로 잘못 묶인 것 같으면 그 인물은 빼거나 caution 에 적는다.
- 추모·사망, 정치, 범죄·논란은 caution 에 조회수용 자극 표현을 피하라는 주의를 적는다.
- 쇼츠 기획은 운영자가 오늘 바로 만들 수 있게 구체적으로: 훅 제목 한 줄 + 쓸 장면·자료.
- 모든 글은 한국어, 짧고 단정하게.`;

const SYSTEM_WITH_SCHEMA = `${SYSTEM}

출력: 아래 JSON 스키마를 따르는 JSON 객체 하나만 쓴다. 코드 블록·설명 문장 없이 { 로 시작해 } 로 끝낸다. 모든 필드를 채우고, 없으면 빈 배열이나 빈 문자열.
${JSON.stringify(SCHEMA)}`;

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const arr = <T>(v: unknown, f: (x: any) => T): T[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' || typeof x === 'string').map(f) : []);

/** Claude 가 쓴 JSON 을 읽어 빠진 필드는 빈 값으로 채운다 */
export function parseResult(text: string): BriefResult | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let j: any;
  try {
    j = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  const pick = (x: any) => ({ title: str(x?.title), reason: str(x?.reason) });
  return {
    headline: str(j.headline),
    promising: arr(j.promising, (x) => ({ pack: str(x.pack), verdict: str(x.verdict), why: str(x.why), entry: str(x.entry), risk: str(x.risk) })),
    categories: arr(j.categories, (x) => ({ pack: str(x.pack), trend: str(x.trend), why: str(x.why), angle: str(x.angle) })),
    keywords: arr(j.keywords, (x) => ({ keyword: str(x.keyword), why: str(x.why), angle: str(x.angle) })),
    season: { summary: str(j.season?.summary), ideas: arr(j.season?.ideas, str) },
    upcoming: arr(j.upcoming, (x) => ({ title: str(x.title), platform: str(x.platform), when: str(x.when), why: str(x.why), prep: str(x.prep) })),
    persons: arr(j.persons, (x) => ({
      name: str(x.name),
      heat: str(x.heat),
      why: str(x.why),
      evidence: arr(x.evidence, str),
      relatedWorks: arr(x.relatedWorks, pick),
      ideas: arr(x.ideas, str),
      caution: str(x.caution),
    })),
    works: arr(j.works, (x) => ({
      title: str(x.title),
      why: str(x.why),
      evidence: arr(x.evidence, str),
      sameTone: arr(x.sameTone, pick),
      sameActor: arr(x.sameActor, (y) => ({ actor: str(y?.actor), title: str(y?.title), reason: str(y?.reason) })),
      ideas: arr(x.ideas, str),
      caution: str(x.caution),
    })),
    googleOpportunities: arr(j.googleOpportunities, (x) => ({ query: str(x.query), angle: str(x.angle) })),
  };
}

export type BriefResult = {
  headline: string;
  promising: { pack: string; verdict: string; why: string; entry: string; risk: string }[];
  categories: { pack: string; trend: string; why: string; angle: string }[];
  keywords: { keyword: string; why: string; angle: string }[];
  season: { summary: string; ideas: string[] };
  upcoming: { title: string; platform: string; when: string; why: string; prep: string }[];
  persons: { name: string; heat: string; why: string; evidence: string[]; relatedWorks: { title: string; reason: string }[]; ideas: string[]; caution: string }[];
  works: {
    title: string;
    why: string;
    evidence: string[];
    sameTone: { title: string; reason: string }[];
    sameActor: { actor: string; title: string; reason: string }[];
    ideas: string[];
    caution: string;
  }[];
  googleOpportunities: { query: string; angle: string }[];
};

export type Brief = {
  result: BriefResult;
  input: BriefInput;
  generatedAt: string;
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costKrw: number;
};


export async function generateBrief(): Promise<Brief> {
  if (!(await hasClaudeKey())) throw new NoClaudeKeyError();
  const input = await gatherBriefInput();
  if (!input.persons.length && !input.works.length && !input.packs.length) throw new Error('분석할 인물·작품이 아직 없습니다 (최근 3일 영상이 모이면 다시)');

  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const r = await askClaude({
    system: SYSTEM_WITH_SCHEMA,
    user: `오늘은 ${today}이다. 아래 자료로 종합 분석을 써라. 유망 카테고리 최대 5개, 카테고리 흐름 최대 8개, 키워드 최대 8개, 인물 최대 6명, 작품 최대 5개, 공개 예정 최대 8개.\n\n<자료>\n${JSON.stringify(input)}\n</자료>`,
    maxTokens: 20000,
    effort: 'medium',
  });
  const result = parseResult(r.text);
  if (!result) throw new Error('Claude 응답을 읽지 못했습니다 — 다시 시도해 주세요');
  const brief: Brief = { result, input, generatedAt: new Date().toISOString(), model: r.model, usage: r.usage, costKrw: r.costKrw };
  await prisma.trendCache.upsert({
    where: { key: 'radar:brief' },
    create: { key: 'radar:brief', payload: brief as object },
    update: { payload: brief as object, fetchedAt: new Date() },
  });
  return brief;
}

/** 마지막 브리핑 (없으면 null) · 키가 있나 */
export async function lastBrief(): Promise<{ brief: Brief | null; hasKey: boolean }> {
  const [row, key] = await Promise.all([
    prisma.trendCache.findUnique({ where: { key: 'radar:brief' } }).catch(() => null),
    hasClaudeKey(),
  ]);
  return { brief: (row?.payload as unknown as Brief) ?? null, hasKey: key };
}
