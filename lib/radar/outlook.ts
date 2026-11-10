/**
 * 카테고리(채널팩) 기회판 — 어느 팩이 지금 떡상 중이고 새 채널이 들어가도 먹히나 (AI 없이 계산).
 *
 * 팩 합계가 아니라 '채널 단위'로 본다 — 큰 채널 하나가 터진 걸 팩 전체가 뜬 걸로 착각하지 않게.
 *  오름세      채널마다 최근 하루 조회 ÷ 기준 기간 하루 조회 (기록이 15일+ 이면 7일 vs 그 전 7일, 아니면 최근 3일 vs 7~10일 전 3일)
 *              → 시장 전체 채널의 중앙값으로 나눠 '시장 대비'로 → 그 중앙값(팩 오름세) + 시장보다 20% 넘게 더 오른 채널 비율(오름 폭)
 *  채널 성과   채널마다 최근 7일 새 영상(올린 지 1일+) 조회 중앙값 → 그 값들의 중앙값
 *  공급 대비   팩 하루 조회 ÷ 하루 새 영상 수 — 영상 하나가 가져가는 몫
 *  신생 성공률 개설 1년 이내 채널 중 최근 영상 중앙값 1만+ 인 비율 (표본이 적으면 전체 평균 쪽으로 당김)
 *  열린 판     100 − 상위 3채널 조회 비중
 * 기회 점수 = 오름세 20 · 오름 폭 10 · 채널 성과 30 · 공급 대비 5 · 신생 성공률 25 · 열린 판 10 의 가중 평균
 *             비율 지표는 팩끼리 순위(0~1), 조회 크기(채널 성과·공급 대비)는 로그 척도(0~1).
 *             공급 대비는 옛 영상 조회가 섞여 새 채널 기회를 부풀리므로 낮게. 새 채널 관점의 핵심은 채널 성과와 신생 성공률.
 *             표본(최근 영상 2개+ 채널 수)이 적은 팩은 50점 쪽으로 당긴다.
 *
 * 한국 시장 기준: 기본은 외국어 채널을 빼고 계산한다 (점수 · 잘 나온 채널 · 대박 신생 모두).
 *  한국어 채널 = 채널 이름에 한글이 있거나, 수집한 영상 제목 중 한글이 든 비율 30%+.
 *  foreign: true 면 외국어 채널까지 넣어 계산.
 */

import { prisma } from '@/lib/db';

/** 주제가 아니라 규모·성격으로 묶은 팩 */
const META_PACKS = new Set(['넘사', '고래', 'No양산형', '주제 자주 변경', '제외', '대기업', '방송사 채널팩', '뉴스공식', '저작권ㄱㅊ?']);
/** 남의 영상을 편집하는 팩 — 점수엔 안 넣고 위험 표시만 */
const REUSE_RE = /(짜|짤|클립|커뮤형|짜집기|해짜|모음)/;
/** 신생 '성공' 기준: 최근 영상 조회 중앙값 */
const YOUNG_SUCCESS = 10_000;

export type ChannelHighlight = {
  externalId: string;
  name: string;
  subscribers: number | null;
  /** 최근 7일 영상 조회 중앙값 · 영상 수 */
  medianViews: number;
  recentVideos: number;
  /** 하루 조회 증가율 % (기준 기간 대비) */
  growthPct: number | null;
  dailyViews: number;
  createdAt: string | null;
  young: boolean;
  /** 대박 신생 (개설 1년 · 영상 400개 이하 · 영상당 평균 100만+ · 30일 안 업로드) */
  rookie: boolean;
};

export type PackOutlook = {
  pack: string;
  /** 계산에 넣은 채널 수 (한국어만 보기면 한국어 채널) */
  channels: number;
  /** 이 팩의 외국어 채널 수 (한국어만 보기면 계산에서 뺀 수) */
  foreignChannels: number;
  /** 최근 7일 영상을 올린 채널 */
  activeChannels: number;
  dailyViews: number;
  /** 시장 대비 오름세 — 채널별 하루 조회 증가율 중앙값이 전체 채널 중앙값보다 몇 % 높나 · 시장보다 20% 넘게 더 오른 채널 비율 (비교할 채널 5곳 미만이면 null) */
  growthPct: number | null;
  risingPct: number | null;
  /** 비교 기간: '7일 vs 그 전 7일' 또는 '3일 vs 1주 전 3일' */
  growthBasis: string;
  /** 채널별 최근 영상 조회 중앙값의 중앙값 */
  channelMedianViews: number | null;
  /** 하루 새 영상 수 · 영상 하나당 팩 하루 조회 */
  uploadsPerDay: number;
  viewsPerUpload: number;
  /** 신생 채널(최근 영상 2개+) 수 · 그중 성공 수 · 성공률 % (표본 보정) */
  youngChannels: number;
  youngSuccess: number;
  youngSuccessPct: number;
  rookies: number;
  top3SharePct: number;
  shortsPct: number;
  /** 남의 영상 편집 팩 — 저작권 주의 */
  reuseRisk: boolean;
  score: number;
  /** 상위 5개 팩만: 최근 잘 나온 채널 · 대박 신생 */
  hot?: ChannelHighlight[];
  rookieList?: ChannelHighlight[];
};

type Row = {
  id: string;
  externalId: string;
  name: string | null;
  subs: number | null;
  folderId: string;
  created: Date | null;
  fmt: string | null;
  d: number | null;
  rd: number | null;
  bd: number | null;
  wide: boolean;
  nv: number | null;
  med: number | null;
  young: boolean;
  rookie: boolean;
  kr: boolean;
};

/** 한국어 채널 판별 — 영상 제목 중 한글이 든 비율 */
const KO_TITLE_RATIO = 0.3;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function highlight(r: Row): ChannelHighlight {
  return {
    externalId: r.externalId,
    name: r.name ?? r.externalId,
    subscribers: r.subs,
    medianViews: Math.round(r.med ?? 0),
    recentVideos: r.nv ?? 0,
    growthPct: r.rd != null && r.bd ? Math.round((r.rd / r.bd - 1) * 100) : null,
    dailyViews: Math.round(r.d ?? 0),
    createdAt: r.created?.toISOString() ?? null,
    young: r.young,
    rookie: r.rookie,
  };
}

/** 미리 계산해 둔 걸 4시간까지 쓴다 (전체 영상 언어 판별 집계가 작은 DB 에서 40초~1분+). radar-precompute 가 force 로 새로 계산 */
export async function categoryOutlook(o: { foreign?: boolean; force?: boolean } = {}): Promise<PackOutlook[]> {
  const key = o.foreign ? 'radar:outlook:v4:all' : 'radar:outlook:v4:kr';
  const c = o.force ? null : await prisma.trendCache.findUnique({ where: { key } }).catch(() => null);
  if (c && Date.now() - c.fetchedAt.getTime() < 4 * 3_600_000) return c.payload as unknown as PackOutlook[];

  const [all, folders] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      WITH c AS (
        SELECT c.id, c."externalId", c."displayName" AS name, c."subscriberCount" AS subs, c."folderId", c."channelCreatedAt" AS created,
          c."contentFormat" AS fmt, c."dailyViews", c."totalViewCount", c."videoCount", c."lastUploadAt",
          c."viewHistory" AS v, cardinality(c."viewHistory") AS n
        FROM "Channel" c WHERE c."isActive" AND c.platform = 'YOUTUBE'
      ), g AS (
        SELECT *,
          CASE WHEN n >= 15 THEN GREATEST(0, v[n] - v[n - 7])::float8 / 7
               WHEN n >= 11 THEN GREATEST(0, v[n] - v[n - 3])::float8 / 3 END AS rd,
          CASE WHEN n >= 15 THEN GREATEST(0, v[n - 7] - v[n - 14])::float8 / 7
               WHEN n >= 11 THEN GREATEST(0, v[n - 7] - v[n - 10])::float8 / 3 END AS bd,
          (n >= 15) AS wide,
          COALESCE(CASE WHEN n >= 4 THEN GREATEST(0, v[n] - v[n - 3])::float8 / 3 END, "dailyViews") AS d
        FROM c
      ), rv AS (
        SELECT v."channelId", COUNT(*)::int AS nv, percentile_cont(0.5) WITHIN GROUP (ORDER BY v.views)::float8 AS med
        FROM "RadarVideo" v
        WHERE v."publishedAt" BETWEEN NOW() - INTERVAL '7 days' AND NOW() - INTERVAL '24 hours'
        GROUP BY 1
      ), lang AS (
        SELECT v."channelId", AVG((v.title ~ '[가-힣]')::int)::float8 AS ko FROM "RadarVideo" v GROUP BY 1
      )
      SELECT g.id, g."externalId", g.name, g.subs, g."folderId", g.created, g.fmt, g.d, g.rd, g.bd, g.wide, rv.nv, rv.med,
        (g.created > NOW() - INTERVAL '365 days') IS TRUE AS young,
        (g.created > NOW() - INTERVAL '365 days' AND g."videoCount" BETWEEN 1 AND 400
          AND g."totalViewCount" / NULLIF(g."videoCount", 0) >= 1000000 AND g."lastUploadAt" > NOW() - INTERVAL '30 days') IS TRUE AS rookie,
        (g.name ~ '[가-힣]' OR lang.ko >= ${KO_TITLE_RATIO}) IS TRUE AS kr
      FROM g LEFT JOIN rv ON rv."channelId" = g.id LEFT JOIN lang ON lang."channelId" = g.id`,
    prisma.folder.findMany({ select: { id: true, name: true } }),
  ]);

  const nameOf = new Map(folders.map((f) => [f.id, f.name]));
  const byPack = new Map<string, Row[]>();
  const foreignBy = new Map<string, number>();
  for (const r of all) {
    const n = nameOf.get(r.folderId);
    if (!n || n.startsWith('__') || META_PACKS.has(n)) continue;
    if (!r.kr) foreignBy.set(n, (foreignBy.get(n) ?? 0) + 1);
    if (!o.foreign && !r.kr) continue;
    const list = byPack.get(n) ?? [];
    list.push(r);
    byPack.set(n, list);
  }
  // 시장 기준값(시장 오름세 · 신생 성공률 사전값)도 같은 범위의 채널로
  const rows = o.foreign ? all : all.filter((r) => r.kr);

  // 시장 전체(비교 가능한 모든 채널)의 증가율 중앙값 — 팩 오름세는 이것 대비로 본다.
  // 수집 기간·요일·유튜브 집계 지연처럼 모든 팩에 같이 걸리는 효과를 빼기 위해
  const marketLog =
    median(
      rows
        .filter((r) => r.rd != null && (r.bd ?? 0) >= 1000)
        .map((r) => Math.log(Math.max(r.rd! / r.bd!, 0.01)))
    ) ?? 0;

  // 신생 성공률 사전값 (전체)
  const allYoung = rows.filter((r) => r.young && (r.nv ?? 0) >= 2);
  const prior = allYoung.length ? allYoung.filter((r) => (r.med ?? 0) >= YOUNG_SUCCESS).length / allYoung.length : 0.2;

  type Calc = PackOutlook & { sample: number; _rows: Row[] };
  const packs: Calc[] = [];
  for (const [pack, list] of byPack) {
    const recent = list.filter((r) => (r.nv ?? 0) >= 1);
    const recent2 = list.filter((r) => (r.nv ?? 0) >= 2);
    if (list.length < 10 || recent2.length < 5) continue;
    const daily = list.reduce((a, r) => a + (r.d ?? 0), 0);
    // 기준 기간에 하루 1,000회 이상이던 채널만 오름세 비교 (작은 채널의 몇 배 튐 제외)
    const comparable = list.filter((r) => r.rd != null && (r.bd ?? 0) >= 1000);
    // 시장 대비 비율
    const ratios = comparable.map((r) => r.rd! / r.bd! / Math.exp(marketLog));
    const growth = ratios.length >= 5 ? median(ratios.map((x) => Math.log(Math.max(x, 0.01)))) : null;
    const top3 = [...list].sort((a, b) => (b.d ?? 0) - (a.d ?? 0)).slice(0, 3).reduce((a, r) => a + (r.d ?? 0), 0);
    const uploads = recent.reduce((a, r) => a + (r.nv ?? 0), 0) / 6;
    const young = recent2.filter((r) => r.young);
    const youngOk = young.filter((r) => (r.med ?? 0) >= YOUNG_SUCCESS).length;
    const K = 5;
    packs.push({
      pack,
      channels: list.length,
      foreignChannels: foreignBy.get(pack) ?? 0,
      activeChannels: recent.length,
      dailyViews: Math.round(daily),
      growthPct: growth == null ? null : Math.round((Math.exp(growth) - 1) * 100),
      risingPct: ratios.length >= 5 ? Math.round((ratios.filter((x) => x > 1.2).length / ratios.length) * 100) : null,
      growthBasis: comparable.some((r) => r.wide) ? '최근 7일 vs 그 전 7일' : '최근 3일 vs 1주 전 3일',
      channelMedianViews: median(recent2.map((r) => r.med ?? 0)),
      uploadsPerDay: Math.round(uploads * 10) / 10,
      viewsPerUpload: uploads > 0 ? Math.round(daily / uploads) : 0,
      youngChannels: young.length,
      youngSuccess: youngOk,
      youngSuccessPct: Math.round(((youngOk + prior * K) / (young.length + K)) * 100),
      rookies: list.filter((r) => r.rookie).length,
      top3SharePct: daily > 0 ? Math.round((top3 / daily) * 100) : 100,
      shortsPct: Math.round((list.filter((r) => r.fmt === 'shorts').length / list.length) * 100),
      reuseRisk: REUSE_RE.test(pack),
      score: 0,
      sample: recent2.length,
      _rows: list,
    });
  }

  // 팩끼리 순위(0~1). 값이 없으면 가운데(0.5)
  const ranker = (vals: (number | null)[]) => {
    const sorted = vals.filter((v): v is number => v != null).sort((a, b) => a - b);
    return (x: number | null) => {
      if (x == null || sorted.length < 2) return 0.5;
      let lo = 0;
      while (lo < sorted.length && sorted[lo] < x) lo++;
      return lo / (sorted.length - 1);
    };
  };
  const rGrowth = ranker(packs.map((p) => p.growthPct));
  const rRising = ranker(packs.map((p) => p.risingPct));
  // 조회 크기는 순위 대신 로그 척도 — 3만 vs 2천 같은 큰 차이가 순위 한 칸으로 뭉개지지 않게
  const logScale = (vals: (number | null)[]) => {
    const ls = vals.filter((v): v is number => v != null).map((v) => Math.log10(Math.max(v, 1)));
    const lo = Math.min(...ls);
    const hi = Math.max(...ls);
    return (x: number | null) => (x == null || hi === lo ? 0.5 : (Math.log10(Math.max(x, 1)) - lo) / (hi - lo));
  };
  const rPerf = logScale(packs.map((p) => p.channelMedianViews));
  const rSupply = logScale(packs.map((p) => p.viewsPerUpload));
  const rYoung = ranker(packs.map((p) => p.youngSuccessPct));
  const rOpen = ranker(packs.map((p) => 100 - p.top3SharePct));
  for (const p of packs) {
    const raw =
      100 *
      (0.2 * rGrowth(p.growthPct) +
        0.1 * rRising(p.risingPct) +
        0.3 * rPerf(p.channelMedianViews) +
        0.05 * rSupply(p.viewsPerUpload) +
        0.25 * rYoung(p.youngSuccessPct) +
        0.1 * rOpen(100 - p.top3SharePct));
    // 표본이 적으면 50 쪽으로
    p.score = Math.round(50 + (raw - 50) * (p.sample / (p.sample + 15)));
    p.channelMedianViews = p.channelMedianViews == null ? null : Math.round(p.channelMedianViews);
  }
  packs.sort((a, b) => b.score - a.score);

  // 상위 5개 팩: 최근 잘 나온 채널(최근 영상 중앙값 순, 2개+) · 대박 신생
  for (const p of packs.slice(0, 5)) {
    p.hot = p._rows
      .filter((r) => (r.nv ?? 0) >= 2)
      .sort((a, b) => (b.med ?? 0) - (a.med ?? 0))
      .slice(0, 6)
      .map(highlight);
    p.rookieList = p._rows
      .filter((r) => r.rookie)
      .sort((a, b) => (b.d ?? 0) - (a.d ?? 0))
      .slice(0, 6)
      .map(highlight);
  }
  const out: PackOutlook[] = packs.map(({ sample: _s, _rows: _r, ...rest }) => rest);
  await prisma.trendCache.upsert({ where: { key }, create: { key, payload: out as object }, update: { payload: out as object, fetchedAt: new Date() } }).catch(() => {});
  return out;
}
