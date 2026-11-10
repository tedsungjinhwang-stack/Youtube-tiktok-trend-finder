/**
 * 터진 영상 미리 계산 — 매시간 수집 직후(9분) 한 번, 「터졌다」 기준(minGain)을 넘은 후보를 RadarHot 에 다시 채운다.
 * 화면·AI 분석은 이 좁은 표에서 필터·정렬하고 상위 200개만 RadarVideo 와 잇는다.
 * (RadarVideo 는 측정 기록 배열 때문에 한 줄이 1KB 쯤 — 30일 후보를 열 때마다 읽으면 작은 DB 에서 24·48시간 창이 15초~1분)
 * 숫자는 수집기가 다시 잴 때만 바뀌니(대부분 한 시간에 한 번) 수집 직후 계산하면 최신 정도는 그대로다.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { minGain, type HotQuery } from './queries';

export const HOT_WINDOWS = [6, 24, 48] as const;
const META_KEY = 'radar:hot-at';
/** 이보다 오래되면(미리 계산이 멈췄으면) 화면은 예전처럼 직접 계산한다 */
const MAX_AGE_MS = 3 * 3_600_000;

export async function refreshHotList(): Promise<{ rows: number; ms: number }> {
  const t0 = Date.now();
  const th = (w: number) => [minGain('shorts', w as 6), minGain('long', w as 6)];
  const [s6, l6] = th(6);
  const [s24, l24] = th(24);
  const [s48, l48] = th(48);
  const rows = await prisma.$transaction(
    async (tx) => {
      // 지우고 채우기를 한 트랜잭션으로 — 그동안 화면은 이전 목록을 본다
      await tx.$executeRaw`DELETE FROM "RadarHot"`;
      return tx.$executeRaw`
        INSERT INTO "RadarHot" (format, win, "videoId", rate, gain, "gain1h", "gain6h", "gain12h", views, "publishedAt", "checkedAt", fresh4, "trackN", "trackSpan", "channelId")
        SELECT CASE WHEN v."isShorts" THEN 'shorts' ELSE 'long' END, w.win, v.id,
          w.g::float8 / GREATEST(LEAST(w.win::float8, EXTRACT(EPOCH FROM NOW() - v."publishedAt") / 3600), 0.5),
          w.g, v."gain1h", v."gain6h", v."gain12h", v.views, v."publishedAt", v."checkedAt", v."checkedAt" > NOW() - INTERVAL '4 hours',
          COALESCE(cardinality(v."trackT"), 0),
          COALESCE(v."trackT"[cardinality(v."trackT")] - v."trackT"[1], 0),
          v."channelId"
        FROM "RadarVideo" v
        CROSS JOIN LATERAL (VALUES (6, v."gain6h"), (24, v."gain24h"), (48, v."gain48h")) w(win, g)
        WHERE v."hotAt" > NOW() - INTERVAL '26 hours' AND v."checkedAt" > NOW() - INTERVAL '26 hours'
          AND v."publishedAt" > NOW() - INTERVAL '30 days' AND v."isShorts" IS NOT NULL AND w.g IS NOT NULL
          AND w.g >= CASE
            WHEN w.win = 6 THEN CASE WHEN v."isShorts" THEN ${s6}::int ELSE ${l6}::int END
            WHEN w.win = 24 THEN CASE WHEN v."isShorts" THEN ${s24}::int ELSE ${l24}::int END
            ELSE CASE WHEN v."isShorts" THEN ${s48}::int ELSE ${l48}::int END
          END`;
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
  const now = new Date();
  await prisma.trendCache
    .upsert({ where: { key: META_KEY }, create: { key: META_KEY, payload: { rows }, fetchedAt: now }, update: { payload: { rows }, fetchedAt: now } })
    .catch(() => {});
  return { rows, ms: Date.now() - t0 };
}

export type HotRow = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
  views: number;
  gain: number | null;
  gain1h: number | null;
  baselineMedian: number | null;
  channelId: string;
  externalId: string;
  displayName: string | null;
  channelThumb: string | null;
  folder: string;
  folderId: string;
  work: string | null;
  workId: string | null;
  guess: string | null;
  matchedBy: string | null;
};

/** 미리 계산한 목록에서 — 쓸 수 없으면(창이 6·24·48 이 아니거나, 급상승순이 아니거나, 계산이 멈췄으면) null → 직접 계산 */
export async function hotRowsFromList(q: HotQuery): Promise<{ rows: HotRow[]; computedAt: string } | null> {
  if (q.sort !== 'rising' || !(HOT_WINDOWS as readonly number[]).includes(q.window)) return null;
  const meta = await prisma.trendCache.findUnique({ where: { key: META_KEY }, select: { fetchedAt: true } }).catch(() => null);
  if (!meta || Date.now() - meta.fetchedAt.getTime() > MAX_AGE_MS) return null;

  const conds: Prisma.Sql[] = [Prisma.sql`h.format = ${q.format}`, Prisma.sql`h.win = ${q.window}::int`, Prisma.sql`c."isActive"`];
  if (q.folders?.length) conds.push(Prisma.sql`f.name = ANY(${q.folders}::text[])`);
  // 6시간 창은 최근 4시간 안에 잰 것만 (역주행은 하루 한 번 재니 26시간)
  if (!(q.revival || q.window >= 24)) conds.push(Prisma.sql`h.fresh4`);
  if (q.excludeWhale) conds.push(Prisma.sql`COALESCE(c."subscriberCount", 0) < 1000000`);
  if (q.multiple) conds.push(Prisma.sql`c."baselineMedian" > 0 AND h.views >= c."baselineMedian" * ${q.multiple}::int`);
  if (q.calmSurge) {
    conds.push(Prisma.sql`h."gain6h" IS NOT NULL AND h."gain12h" IS NOT NULL AND h."gain12h" - h."gain6h" >= 1000
      AND h."gain6h" >= 1.5 * (h."gain12h" - h."gain6h") AND h."publishedAt" < NOW() - INTERVAL '12 hours'
      AND h."trackN" >= 2 AND h."trackSpan" >= 720`);
  }
  if (q.revival) conds.push(Prisma.sql`h."publishedAt" < NOW() - INTERVAL '7 days'`);

  // 좁은 표에서 먼저 200개를 고르고 나서 무거운 영상 표와 잇는다
  const rows = await prisma.$queryRaw<HotRow[]>`
    WITH top AS MATERIALIZED (
      SELECT h."videoId", h."publishedAt", h.views, h.gain, h."gain1h", h.rate,
        c."baselineMedian", c.id AS "channelId", c."externalId", c."displayName", c."thumbnailUrl" AS "channelThumb", f.name AS folder, f.id AS "folderId"
      FROM "RadarHot" h
      JOIN "Channel" c ON c.id = h."channelId"
      JOIN "Folder" f ON f.id = c."folderId"
      WHERE ${Prisma.join(conds, ' AND ')}
      ORDER BY h.rate DESC
      LIMIT 200
    )
    SELECT v.id, v.title, v."thumbnailUrl", t."publishedAt", t.views, t.gain, t."gain1h", t."baselineMedian",
      t."channelId", t."externalId", t."displayName", t."channelThumb", t.folder, t."folderId",
      w.title AS work, v."workId", gw.title AS guess, v."matchedBy"
    FROM top t
    JOIN "RadarVideo" v ON v.id = t."videoId"
    LEFT JOIN "RadarWork" w ON w.id = v."workId"
    LEFT JOIN "RadarWork" gw ON gw.id = v."guessWorkId"
    ORDER BY t.rate DESC`;
  return { rows, computedAt: meta.fetchedAt.toISOString() };
}
