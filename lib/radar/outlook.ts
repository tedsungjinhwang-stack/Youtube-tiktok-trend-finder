/**
 * 카테고리(채널팩) 기회판 — 어느 팩이 유망한가 (AI 없이 계산).
 *
 *  수요: 팩 하루 조회수, 1주 전 대비 (채널마다 하루 한 번 적는 총 조회수 기록으로 최근 3일 평균 vs 7~10일 전 3일 평균)
 *  공급 대비 반응: 최근 7일 새 영상 수(1일 이상 된 것), 영상당 조회 중앙값, 10만+·100만+ 비율
 *  진입 가능성: 개설 1년 이내 채널이 팩 조회에서 차지하는 비중, 대박 신생 수, 상위 3채널 쏠림(낮을수록 열린 판)
 *  기회 점수(0~100): 위 다섯 가지를 팩끼리 순위로 바꿔 가중 평균 — 오름세 25 · 영상당 조회 25 · 10만+ 비율 20 · 신생 비중 20 · 열린 판 10
 */

import { prisma } from '@/lib/db';

/** 주제가 아니라 규모·성격으로 묶은 팩 */
const META_PACKS = new Set(['넘사', '고래', 'No양산형', '주제 자주 변경', '제외', '대기업', '방송사 채널팩', '뉴스공식', '저작권ㄱㅊ?']);

export type PackOutlook = {
  pack: string;
  channels: number;
  /** 최근 7일 업로드한 채널 */
  activeChannels: number;
  /** 팩 하루 조회수 (최근 3일 평균) */
  dailyViews: number;
  /** 1주 전 대비 % (같은 채널들, 기록이 11일 이상 쌓인 채널만) */
  weekGrowthPct: number | null;
  /** 최근 7일 새 영상 (올린 지 1일 이상) */
  newVideos: number;
  medianViews: number;
  hit100kPct: number;
  hit1m: number;
  /** 개설 1년 이내 채널의 조회 비중 % · 대박 신생 수 */
  youngSharePct: number;
  rookies: number;
  /** 상위 3채널이 팩 조회에서 차지하는 % */
  top3SharePct: number;
  shortsPct: number;
  score: number;
};

export async function categoryOutlook(): Promise<PackOutlook[]> {
  const key = 'radar:outlook';
  const c = await prisma.trendCache.findUnique({ where: { key } }).catch(() => null);
  if (c && Date.now() - c.fetchedAt.getTime() < 3_600_000) return c.payload as unknown as PackOutlook[];

  const [chRows, vRows, folders] = await Promise.all([
    prisma.$queryRaw<
      { folderId: string; channels: number; active7: number; daily: number | null; rd: number | null; bd: number | null; top3: number | null; youngDaily: number | null; rookies: number; shorts: number }[]
    >`
      WITH c AS (
        SELECT c."folderId", c."channelCreatedAt", c."lastUploadAt", c."dailyViews", c."totalViewCount", c."videoCount", c."contentFormat",
          c."viewHistory" AS v, cardinality(c."viewHistory") AS n
        FROM "Channel" c WHERE c."isActive" AND c.platform = 'YOUTUBE'
      ), cd AS (
        SELECT *,
          CASE WHEN n >= 11 THEN GREATEST(0, (v[n] - v[n - 3]))::float8 / 3 END AS rd,
          CASE WHEN n >= 11 THEN GREATEST(0, (v[n - 7] - v[n - 10]))::float8 / 3 END AS bd,
          COALESCE(CASE WHEN n >= 4 THEN GREATEST(0, (v[n] - v[n - 3]))::float8 / 3 END, "dailyViews") AS d
        FROM c
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY "folderId" ORDER BY d DESC NULLS LAST) AS rk FROM cd
      )
      SELECT "folderId", COUNT(*)::int AS channels,
        (COUNT(*) FILTER (WHERE "lastUploadAt" > NOW() - INTERVAL '7 days'))::int AS active7,
        SUM(d)::float8 AS daily, SUM(rd)::float8 AS rd, SUM(bd)::float8 AS bd,
        (SUM(d) FILTER (WHERE rk <= 3))::float8 AS top3,
        (SUM(d) FILTER (WHERE "channelCreatedAt" > NOW() - INTERVAL '365 days'))::float8 AS "youngDaily",
        (COUNT(*) FILTER (WHERE "channelCreatedAt" > NOW() - INTERVAL '365 days' AND "videoCount" BETWEEN 1 AND 400
          AND "totalViewCount" / NULLIF("videoCount", 0) >= 1000000 AND "lastUploadAt" > NOW() - INTERVAL '30 days'))::int AS rookies,
        (COUNT(*) FILTER (WHERE "contentFormat" = 'shorts'))::int AS shorts
      FROM ranked GROUP BY 1`,
    prisma.$queryRaw<{ folderId: string; vids: number; med: number | null; h100k: number; h1m: number }[]>`
      SELECT c."folderId", COUNT(*)::int AS vids,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY v.views)::float8 AS med,
        (COUNT(*) FILTER (WHERE v.views >= 100000))::int AS h100k,
        (COUNT(*) FILTER (WHERE v.views >= 1000000))::int AS h1m
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."publishedAt" BETWEEN NOW() - INTERVAL '7 days' AND NOW() - INTERVAL '24 hours'
      GROUP BY 1`,
    prisma.folder.findMany({ select: { id: true, name: true } }),
  ]);

  const name = new Map(folders.map((f) => [f.id, f.name]));
  const vBy = new Map(vRows.map((r) => [r.folderId, r]));
  const rows = chRows
    .filter((r) => {
      const n = name.get(r.folderId);
      return n && !n.startsWith('__') && !META_PACKS.has(n) && r.channels >= 10 && (vBy.get(r.folderId)?.vids ?? 0) >= 20;
    })
    .map((r) => {
      const v = vBy.get(r.folderId)!;
      const daily = r.daily ?? 0;
      return {
        pack: name.get(r.folderId)!,
        channels: r.channels,
        activeChannels: r.active7,
        dailyViews: Math.round(daily),
        weekGrowthPct: r.rd != null && r.bd ? Math.round((r.rd / r.bd - 1) * 100) : null,
        newVideos: v.vids,
        medianViews: Math.round(v.med ?? 0),
        hit100kPct: Math.round((v.h100k / v.vids) * 1000) / 10,
        hit1m: v.h1m,
        youngSharePct: daily > 0 ? Math.round(((r.youngDaily ?? 0) / daily) * 100) : 0,
        rookies: r.rookies,
        top3SharePct: daily > 0 ? Math.round(((r.top3 ?? 0) / daily) * 100) : 100,
        shortsPct: Math.round((r.shorts / r.channels) * 100),
        score: 0,
      };
    });

  // 팩끼리 순위(0~1)로 바꿔 가중 평균
  const rank = (vals: number[]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    return (x: number) => (sorted.length > 1 ? sorted.findIndex((y) => y >= x) / (sorted.length - 1) : 0.5);
  };
  const rGrowth = rank(rows.map((r) => r.weekGrowthPct ?? 0));
  const rMed = rank(rows.map((r) => r.medianViews));
  const rHit = rank(rows.map((r) => r.hit100kPct));
  const rYoung = rank(rows.map((r) => r.youngSharePct));
  const rOpen = rank(rows.map((r) => 100 - r.top3SharePct));
  for (const r of rows) {
    r.score = Math.round(
      100 *
        (0.25 * rGrowth(r.weekGrowthPct ?? 0) +
          0.25 * rMed(r.medianViews) +
          0.2 * rHit(r.hit100kPct) +
          0.2 * rYoung(r.youngSharePct) +
          0.1 * rOpen(100 - r.top3SharePct))
    );
  }
  rows.sort((a, b) => b.score - a.score);
  await prisma.trendCache.upsert({ where: { key }, create: { key, payload: rows as object }, update: { payload: rows as object, fetchedAt: new Date() } }).catch(() => {});
  return rows;
}
