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

import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { prisma } from '@/lib/db';
import { googleTrending } from '@/lib/trends/google';
import { readSecret } from '@/lib/trends/cache';
import type { PersonCredit } from './match';
import { tmdb } from './tmdb';

const MODEL = 'claude-opus-5-5';
/** 원/달러 어림 (비용 표시용) */
const USD_KRW = 1400;
/** claude-opus-5-5 $/1M 토큰 */
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

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

export type BriefInput = {
  persons: BriefPersonInput[];
  works: BriefWorkInput[];
  google: { query: string; volume: number; related: string[] }[];
};

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

  const [similar, personNews, workNews, google] = await Promise.all([
    Promise.all(works.map((w) => similarWorks(w.mediaType, w.tmdbId))),
    Promise.all(topPersons.map((p) => googleNews(p.name))),
    Promise.all(works.map((w) => googleNews(w.title.split(':')[0]))),
    googleTrending(24)
      .then((r) => r.data)
      .catch(() => []),
  ]);

  return {
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
  required: ['headline', 'persons', 'works', 'googleOpportunities'],
  properties: {
    headline: { type: 'string', description: '오늘 판을 한두 문장으로' },
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
입력은 세 가지 자료다: (1) 감시 중인 유튜브 채널 수만 곳의 최근 3일 수치 — 인물·작품별 채널 수, 영상 수, 최근 24시간 조회 증가, 상위 영상 제목 (2) 구글 급상승 검색어(최근 24시간) (3) 구글 뉴스 최근 기사 제목, 그리고 TMDB 출연작·추천작.

할 일:
- 인물마다 왜 지금 뜨는지 기사·구글·유튜브 근거를 엮어 설명하고, 이 인물로 같이 탈 작품(출연작·화제작)과 쇼츠 기획을 낸다.
- 작품마다 왜 뜨는지, 결이 맞는 다른 작품(장르·정서·소재가 닮은 것), 같은 배우의 다른 작품, 쇼츠 기획을 낸다.
- 구글 급상승 중 유튜브 데이터에 아직 약한 소재를 골라 선점 기회로 낸다.

규칙:
- 사실(사건·수치·날짜)은 입력 자료에 있는 것만 쓴다. 기사에 없는 사건을 지어내지 않는다. 확신이 없으면 "기사로 확인 필요"라고 쓴다.
- 결 맞는 작품·같은 배우 작품은 입력의 TMDB 출연작·추천작을 우선 쓰고, 네 지식으로 보탤 때도 실제로 있는 작품만 쓴다.
- 인물 이름이 일반 단어거나 동명이인으로 잘못 묶인 것 같으면 그 인물은 빼거나 caution 에 적는다.
- 추모·사망, 정치, 범죄·논란은 caution 에 조회수용 자극 표현을 피하라는 주의를 적는다.
- 쇼츠 기획은 운영자가 오늘 바로 만들 수 있게 구체적으로: 훅 제목 한 줄 + 쓸 장면·자료.
- 모든 글은 한국어, 짧고 단정하게.`;

export type BriefResult = {
  headline: string;
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

export class NoClaudeKeyError extends Error {
  constructor() {
    super('Claude API 키가 없습니다 — 설정 → API 키에서 「Claude API」를 넣어 주세요');
    this.name = 'NoClaudeKeyError';
  }
}

export async function generateBrief(): Promise<Brief> {
  const apiKey = await readSecret('ANTHROPIC_API_KEY');
  if (!apiKey) throw new NoClaudeKeyError();
  const input = await gatherBriefInput();
  if (!input.persons.length && !input.works.length) throw new Error('분석할 인물·작품이 아직 없습니다 (최근 3일 영상이 모이면 다시)');

  const client = new Anthropic({ apiKey, timeout: 280_000, maxRetries: 1 });
  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    // 안전 분류기가 거절하면 서버가 알맞은 다른 모델로 다시 돌린다
    fallbacks: 'default',
    output_config: { effort: 'medium', format: jsonSchemaOutputFormat(SCHEMA) },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: `오늘은 ${today}이다. 아래 자료로 브리핑을 써라. 인물은 최대 8명, 작품은 최대 6개.\n\n<자료>\n${JSON.stringify(input)}\n</자료>`,
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude 가 이 자료의 분석을 거절했습니다');
  if (response.stop_reason === 'max_tokens') throw new Error('답이 너무 길어 잘렸습니다 — 다시 시도해 주세요');
  const result = response.parsed_output as unknown as BriefResult | null;
  if (!result) throw new Error('Claude 응답을 읽지 못했습니다');

  const u = response.usage;
  const usage = {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
  const usd =
    (usage.input * PRICE.input + usage.output * PRICE.output + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) / 1_000_000;
  const brief: Brief = {
    result,
    input,
    generatedAt: new Date().toISOString(),
    model: response.model,
    usage,
    costKrw: Math.round(usd * USD_KRW),
  };
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
    readSecret('ANTHROPIC_API_KEY'),
  ]);
  return { brief: (row?.payload as unknown as Brief) ?? null, hasKey: !!key };
}
