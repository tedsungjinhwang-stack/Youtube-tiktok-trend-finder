/**
 * 쇼츠 운영 플레이북 데이터 — 「잘되는 자리를 데이터로 찾고(기획) → 형식·구성만 가져와 → 한 가지를 바꾸고(차별화) → 검증된 소재로 채운다」를
 * 채널파인더 대신 우리 채널팩·조회수 기록으로 계산한다 (AI 없이, 1시간 캐시).
 *
 *  양산형 레이더  구독 8만 이하(공식·뉴스·아이돌 공식 채널을 걸러 양산형만) 한국어 채널 — 하루 조회(최근 3일 중앙값) 순.
 *                 채널력 신호: 최근 영상 조회의 바닥(하위 25%)이 1주 전보다 올랐나
 *  형식 신호      팩마다 59초 이하 vs 미드폼(1~3분) vs 롱폼 영상 조회 중앙값 — 미드폼이 확 잘 나오는 팩 (구성 차별화 근거)
 *  부활 후보 작품 최근 한 달 안에 감시 채널에서 크게 터졌는데(30만+ 영상 여러 개, 채널 2곳+) 지금 10일 동안은 거의 아무도 안 하는 작품
 *                 (영드짜는 작품 선정이 9할 — 양산형이 지금 안 하는 작품으로)
 */

import { prisma } from '@/lib/db';
import { CATEGORY_LABEL, type WorkCategory } from './types';

const H = 3_600_000;
/** 규모·성격으로 묶은 팩 — 벤치마킹 대상에서 뺀다 */
const META_PACKS = ['넘사', '고래', 'No양산형', '주제 자주 변경', '제외', '대기업', '방송사 채널팩', '뉴스공식', '저작권ㄱㅊ?'];
/** 양산형으로 보는 구독자 상한 */
export const MASS_MAX_SUBS = 80_000;

export type MassChannel = {
  externalId: string;
  name: string;
  thumbnailUrl: string | null;
  pack: string;
  subscribers: number | null;
  /** 하루 조회 — 최근 3일 하루 증가의 중앙값 (튀는 날 하나에 안 흔들리게) */
  dailyViews: number;
  createdAt: string | null;
  /** 최근 14일 영상 수 · 조회 중앙값 · 바닥(하위 25%) */
  videos14d: number;
  medianViews: number | null;
  floorViews: number | null;
  /** 바닥 변화 % — 최근 7일 영상 vs 그 전 7일 (채널력 신호) */
  floorTrendPct: number | null;
  /** 최근 영상 형식 비율 % */
  shortPct: number;
  midPct: number;
  longPct: number;
  top: { id: string; title: string; views: number; durationSec: number | null } | null;
};

export type FormatSignal = {
  pack: string;
  short: { n: number; median: number };
  mid: { n: number; median: number; channels: number };
  long: { n: number; median: number };
  /** 미드폼 중앙값 ÷ 59초 이하 중앙값 */
  midVsShort: number;
};

export type RevivalWork = {
  workId: string;
  title: string;
  year: string | null;
  category: string;
  categoryLabel: string;
  posterPath: string | null;
  pastMax: number;
  /** 30만+ 영상 수 · 그때 다룬 채널 수 */
  past300k: number;
  pastChannels: number;
  /** 최근 10일 영상 수 · 채널 수 */
  recentVideos: number;
  recentChannels: number;
  top: { id: string; title: string; views: number; channel: string } | null;
};

export type Playbook = { generatedAt: string; mass: MassChannel[]; formats: FormatSignal[]; revival: RevivalWork[] };

const KEY = 'radar:playbook:v1';

export async function getPlaybook(): Promise<Playbook> {
  const c = await prisma.trendCache.findUnique({ where: { key: KEY } }).catch(() => null);
  if (c && Date.now() - c.fetchedAt.getTime() < H) return c.payload as unknown as Playbook;
  const [mass, formats, revival] = await Promise.all([massRadar(), formatSignals(), revivalWorks()]);
  const out: Playbook = { generatedAt: new Date().toISOString(), mass, formats, revival };
  await prisma.trendCache.upsert({ where: { key: KEY }, create: { key: KEY, payload: out as object }, update: { payload: out as object, fetchedAt: new Date() } }).catch(() => {});
  return out;
}

/* ───────────── 양산형 레이더 ───────────── */

async function massRadar(): Promise<MassChannel[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      externalId: string;
      name: string | null;
      thumbnailUrl: string | null;
      pack: string;
      subs: number | null;
      created: Date | null;
      daily: bigint | null;
    }[]
  >`
    WITH lang AS (
      SELECT "channelId", AVG((title ~ '[가-힣]')::int)::float8 AS ko FROM "RadarVideo" GROUP BY 1
    ), c AS (
      SELECT c.*, cardinality(c."viewHistory") AS n FROM "Channel" c
      WHERE c."isActive" AND c.platform = 'YOUTUBE' AND COALESCE(c."subscriberCount", 0) <= ${MASS_MAX_SUBS}::int
    )
    SELECT c.id, c."externalId", c."displayName" AS name, c."thumbnailUrl", f.name AS pack, c."subscriberCount" AS subs,
      c."channelCreatedAt" AS created,
      CASE WHEN c.n >= 4 THEN (
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY GREATEST(d, 0))
        FROM unnest(ARRAY[c."viewHistory"[c.n] - c."viewHistory"[c.n-1], c."viewHistory"[c.n-1] - c."viewHistory"[c.n-2], c."viewHistory"[c.n-2] - c."viewHistory"[c.n-3]]) d
      )::bigint ELSE c."dailyViews" END AS daily
    FROM c JOIN "Folder" f ON f.id = c."folderId" LEFT JOIN lang ON lang."channelId" = c.id
    WHERE f.name <> ALL(${META_PACKS}::text[]) AND f.name NOT LIKE '\\_\\_%'
      AND (c."displayName" ~ '[가-힣]' OR lang.ko >= 0.3)
    ORDER BY daily DESC NULLS LAST
    LIMIT 40`;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const vids = await prisma.$queryRaw<{ channelId: string; id: string; title: string; views: number; durationSec: number | null; publishedAt: Date }[]>`
    SELECT "channelId", id, title, views, "durationSec", "publishedAt" FROM "RadarVideo"
    WHERE "channelId" = ANY(${ids}::text[]) AND "publishedAt" > NOW() - INTERVAL '15 days'`;
  const byCh = new Map<string, typeof vids>();
  for (const v of vids) {
    const l = byCh.get(v.channelId) ?? [];
    l.push(v);
    byCh.set(v.channelId, l);
  }
  const now = Date.now();
  // 올린 지 하루 넘은 영상만 (막 올라온 영상은 조회가 덜 차서 바닥을 끌어내린다)
  const settled = (v: { publishedAt: Date }) => now - v.publishedAt.getTime() > 24 * H;
  return rows.map((r) => {
    const all = byCh.get(r.id) ?? [];
    const recent = all.filter((v) => now - v.publishedAt.getTime() <= 14 * 24 * H);
    const views = recent.filter(settled).map((v) => v.views);
    const wk1 = recent.filter((v) => settled(v) && now - v.publishedAt.getTime() <= 7 * 24 * H).map((v) => v.views);
    const wk2 = recent.filter((v) => now - v.publishedAt.getTime() > 7 * 24 * H).map((v) => v.views);
    const f1 = quantile(wk1, 0.25);
    const f2 = quantile(wk2, 0.25);
    const fmt = (v: { durationSec: number | null }) => ((v.durationSec ?? 0) <= 60 ? 's' : (v.durationSec ?? 0) <= 180 ? 'm' : 'l');
    const pct = (k: string) => (recent.length ? Math.round((recent.filter((v) => fmt(v) === k).length / recent.length) * 100) : 0);
    const top = [...recent].sort((a, b) => b.views - a.views)[0];
    return {
      externalId: r.externalId,
      name: r.name ?? r.externalId,
      thumbnailUrl: r.thumbnailUrl,
      pack: r.pack,
      subscribers: r.subs,
      dailyViews: Number(r.daily ?? 0),
      createdAt: r.created?.toISOString() ?? null,
      videos14d: recent.length,
      medianViews: quantile(views, 0.5),
      floorViews: quantile(views, 0.25),
      floorTrendPct: f1 != null && f2 != null && f2 > 0 && wk1.length >= 3 && wk2.length >= 3 ? Math.round((f1 / f2 - 1) * 100) : null,
      shortPct: pct('s'),
      midPct: pct('m'),
      longPct: pct('l'),
      top: top ? { id: top.id, title: top.title, views: top.views, durationSec: top.durationSec } : null,
    };
  });
}

function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo));
}

/* ───────────── 형식 신호 ───────────── */

async function formatSignals(): Promise<FormatSignal[]> {
  const rows = await prisma.$queryRaw<
    { pack: string; ns: number; ms: number | null; nm: number; mm: number | null; cm: number; nl: number; ml: number | null }[]
  >`
    SELECT f.name AS pack,
      COUNT(*) FILTER (WHERE v."durationSec" <= 60)::int AS ns,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY v.views) FILTER (WHERE v."durationSec" <= 60)::float8 AS ms,
      COUNT(*) FILTER (WHERE v."durationSec" BETWEEN 61 AND 180)::int AS nm,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY v.views) FILTER (WHERE v."durationSec" BETWEEN 61 AND 180)::float8 AS mm,
      COUNT(DISTINCT v."channelId") FILTER (WHERE v."durationSec" BETWEEN 61 AND 180)::int AS cm,
      COUNT(*) FILTER (WHERE v."durationSec" > 180)::int AS nl,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY v.views) FILTER (WHERE v."durationSec" > 180)::float8 AS ml
    FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId" JOIN "Folder" f ON f.id = c."folderId"
    WHERE v."publishedAt" BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '2 days'
      AND f.name <> ALL(${META_PACKS}::text[]) AND f.name NOT LIKE '\\_\\_%'
    GROUP BY 1`;
  return rows
    .filter((r) => r.ns >= 15 && r.nm >= 15 && r.cm >= 3 && (r.ms ?? 0) > 0)
    .map((r) => ({
      pack: r.pack,
      short: { n: r.ns, median: Math.round(r.ms ?? 0) },
      mid: { n: r.nm, median: Math.round(r.mm ?? 0), channels: r.cm },
      long: { n: r.nl, median: Math.round(r.ml ?? 0) },
      midVsShort: Math.round(((r.mm ?? 0) / (r.ms ?? 1)) * 10) / 10,
    }))
    .sort((a, b) => b.midVsShort - a.midVsShort);
}

/* ───────────── 부활 후보 작품 ───────────── */

async function revivalWorks(): Promise<RevivalWork[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      title: string;
      year: string | null;
      category: string;
      posterPath: string | null;
      pastMax: number;
      past300k: number;
      pastCh: number;
      n10: number;
      ch10: number;
    }[]
  >`
    WITH older AS (
      SELECT "workId", MAX(views)::int AS "pastMax", COUNT(*) FILTER (WHERE views >= 300000)::int AS "past300k",
        COUNT(DISTINCT "channelId") FILTER (WHERE views >= 100000)::int AS "pastCh"
      FROM "RadarVideo" WHERE "workId" IS NOT NULL AND "publishedAt" < NOW() - INTERVAL '10 days' GROUP BY 1
    ), recent AS (
      SELECT "workId", COUNT(*)::int AS n10, COUNT(DISTINCT "channelId")::int AS ch10
      FROM "RadarVideo" WHERE "workId" IS NOT NULL AND "publishedAt" >= NOW() - INTERVAL '10 days' GROUP BY 1
    )
    SELECT w.id, w.title, w.year, w.category, w."posterPath", o."pastMax", o."past300k", o."pastCh",
      COALESCE(r.n10, 0) AS n10, COALESCE(r.ch10, 0) AS ch10
    FROM "RadarWork" w JOIN older o ON o."workId" = w.id LEFT JOIN recent r ON r."workId" = w.id
    WHERE o."pastMax" >= 500000 AND o."past300k" >= 2 AND o."pastCh" >= 2 AND COALESCE(r.ch10, 0) <= 1
    ORDER BY o."pastMax" DESC
    LIMIT 30`;
  if (!rows.length) return [];
  const tops = await prisma.$queryRaw<{ workId: string; id: string; title: string; views: number; channel: string }[]>`
    SELECT DISTINCT ON (v."workId") v."workId", v.id, v.title, v.views, COALESCE(c."displayName", c."externalId") AS channel
    FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
    WHERE v."workId" = ANY(${rows.map((r) => r.id)}::text[])
    ORDER BY v."workId", v.views DESC`;
  const topBy = new Map(tops.map((t) => [t.workId, t]));
  return rows.map((r) => {
    const t = topBy.get(r.id);
    return {
      workId: r.id,
      title: r.title,
      year: r.year,
      category: r.category,
      categoryLabel: CATEGORY_LABEL[r.category as WorkCategory] ?? r.category,
      posterPath: r.posterPath,
      pastMax: r.pastMax,
      past300k: r.past300k,
      pastChannels: r.pastCh,
      recentVideos: r.n10,
      recentChannels: r.ch10,
      top: t ? { id: t.id, title: t.title, views: t.views, channel: t.channel } : null,
    };
  });
}

/* ───────────── AI 판단 기준 ───────────── */

/** AI 종합 분석 · 탭별 AI 분석이 같이 쓰는 운영 원칙 (기획 → 차별화 → 소재) */
export const PLAYBOOK_RULES = `운영 원칙 (판단 기준):
- 감이 아니라 데이터: 지금 조회가 나오는 자리(카테고리·채널·작품)가 알고리즘이 밀어주는 자리다. 왜 터졌는지 당장 납득이 안 돼도 수치가 좋으면 소재로 쓴다.
- 벤치마킹은 잘되는 채널의 '형식과 구성'만 가져온다. 같은 소재·키워드를 그대로 쓰면 채널력 있는 1등과 수많은 복제 채널에 묻힌다.
- 차별화는 한 번에 하나만 바꾼다: ① 템플릿(인스타형↔일반형) ② 소재의 결(인물·종목·나라·커뮤니티 출처 — 예: 한국 예능→일본 예능, 국내 커뮤니티→해외 커뮤니티) ③ 구성(59초→미드폼 1~3분, 하단 댓글 카드, +@ 소재 섞기, 원본 대사+TTS 내레이션) ④ 타깃 핀셋(그룹·작품 전체 대신 덜 다뤄진 멤버·출연자 한 명 → 채널력이 붙으면 전체로 넓힘) ⑤ 해외 양산형 채널이 이미 쓰는 방식 가져오기.
- 경쟁 강도: 같은 작품·인물·키워드를 다룬 채널·영상이 적을수록 좋다. 예전에 크게 터졌는데 지금 올라오는 영상이 적은 작품이 확률이 가장 높다 (영드짜는 작품 선정이 9할).
- 1등이 아니어도 된다: 시장이 큰 카테고리는 2~3등도 충분히 번다.
- 카테고리는 수명이 있다: 오름세가 꺾이고 채널들 조회가 떨어지는 곳은 지금 뜨는 곳으로 갈아타라고 말한다.
- 채널력 신호: 48시간 조회가 오르고, 영상별 조회의 바닥(하위 25%)이 올라간다.
- 편집·자막 꾸미기보다 소재가 전부다 — 기획은 소재와 구성 위주로.`;
