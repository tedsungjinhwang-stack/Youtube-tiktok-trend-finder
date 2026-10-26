/**
 * 꿀통레이더 수집기 — /api/cron/radar 를 Supabase pg_cron 이 매시 정각·3분·6분에 부른다.
 * 한 번에 60초 제한이라 한 시간 몫을 세 번에 나눠 하고, 할 일이 없으면 바로 끝난다 (할당량을 쓰지 않음).
 *
 * 한 번 돌 때 시간(약 45초)과 유튜브 할당량 안에서 아래를 차례로 한다. 유튜브 호출은 몇 개씩 동시에 보낸다.
 *  1. 채널 통계  — 모든 활성 채널은 하루 한 번, 관심 목록 채널은 매시간 (channels.list, 50개 = 1 unit)
 *                 하루 한 번 총 조회수·영상 수를 기록해 하루/7일/30일 조회수와 주당 업로드를 낸다.
 *  2. 새 영상 찾기 — 관심 목록 채널 중 영상 수가 늘었거나 하루 넘게 안 본 채널 (playlistItems, 채널당 1 unit)
 *  3. 영상 조회수 — 관심 목록 채널의 최근 영상 (videos.list, 50개 = 1 unit)
 *                 72시간 안 = 매시간, 7일 안 = 6시간마다, 30일 안 = 하루 한 번
 *  4. 하루 정리  — 채널 평소 조회(중앙값)·쇼츠/롱폼 구분 계산, 35일 넘은 영상 삭제
 *  5. 과거 트래픽 — 업로드가 60일 넘게 끊긴 채널의 100만+ 영상(인기 쇼츠·인기 영상 재생목록)을 남기고 채널을 지운다.
 *                 하루에 쓸 몫을 정해 두고(관심 목록 추적 몫을 빼고) 남는 할당량으로 조금씩.
 */

import { prisma } from '@/lib/db';
import {
  QuotaGoneError,
  fetchChannelStats,
  fetchLatestUploadIds,
  fetchPlaylistPage,
  fetchVideos,
  remainingQuota,
  type YtVideo,
} from '@/lib/youtube/api';
import { resetStaleQuotas } from '@/lib/youtube/keyManager';

/** 다른 기능(키워드 검색 등)이 쓸 몫으로 남겨 두는 할당량 */
const RESERVE_UNITS = 1500;
const INT_MAX = 2_147_483_647;
const H = 3_600_000;

export type CollectReport = {
  startedAt: string;
  ms: number;
  quotaLeft: number | null;
  channelsChecked: number;
  channelsGone: number;
  uploadScans: number;
  newVideos: number;
  videosRefreshed: number;
  videosGone: number;
  maintenance: boolean;
  archivedChannels: number;
  pastHits: number;
  stoppedBy: string | null;
};

/** KST 기준 오늘 날짜 (00:00 UTC 로 표현한 Date — @db.Date 칸에 그대로 넣는다) */
function kstToday(now = new Date()): Date {
  const k = new Date(now.getTime() + 9 * H);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
}

const toMin = (d: Date) => Math.floor(d.getTime() / 60_000);

/** items 를 n 개씩 동시에 처리 (유튜브 호출이 대부분 기다리는 시간이라 묶어서 보낸다) */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function runRadarCollect(opts: { budgetMs?: number } = {}): Promise<CollectReport> {
  const t0 = Date.now();
  const deadline = t0 + (opts.budgetMs ?? 45_000);
  const report: CollectReport = {
    startedAt: new Date(t0).toISOString(),
    ms: 0,
    quotaLeft: null,
    channelsChecked: 0,
    channelsGone: 0,
    uploadScans: 0,
    newVideos: 0,
    videosRefreshed: 0,
    videosGone: 0,
    maintenance: false,
    archivedChannels: 0,
    pastHits: 0,
    stoppedBy: null,
  };
  // 날짜가 바뀌었으면 키 사용량부터 0 으로 (남은 할당량 계산이 그 뒤에 와야 한다)
  await resetStaleQuotas();
  let left = (await remainingQuota()) ?? 0;
  /** 이번에 units 만큼 더 써도 되나 — 시간·할당량 둘 다 본다 */
  const canSpend = (units: number) => {
    if (Date.now() > deadline) {
      report.stoppedBy ??= 'time';
      return false;
    }
    if (left - units < RESERVE_UNITS) {
      report.stoppedBy ??= 'quota';
      return false;
    }
    return true;
  };
  const spend = (units: number) => {
    left -= units;
  };

  try {
    await stepChannelStats(report, canSpend, spend);
    await stepUploadScan(report, canSpend, spend);
    await stepRefreshVideos(report, canSpend, spend);
    report.maintenance = await stepDailyMaintenance();
    await stepArchive(report, canSpend, spend);
  } catch (e) {
    if (e instanceof QuotaGoneError) report.stoppedBy = 'quota';
    else throw e;
  }

  report.ms = Date.now() - t0;
  report.quotaLeft = await remainingQuota();
  await prisma.trendCache
    .upsert({
      where: { key: 'radar:last-collect' },
      create: { key: 'radar:last-collect', payload: report as object },
      update: { payload: report as object, fetchedAt: new Date() },
    })
    .catch(() => {});
  return report;
}

/* ───────────── 1. 채널 통계 ───────────── */

async function stepChannelStats(report: CollectReport, canSpend: (u: number) => boolean, spend: (u: number) => void) {
  const today = kstToday();
  const hourAgo = new Date(Date.now() - H);
  const base = { platform: 'YOUTUBE' as const, isActive: true, externalId: { startsWith: 'UC' } };
  // 관심 목록 채널은 매시간, 나머지는 하루 한 번 (오늘 기록이 없는 것)
  const watched = await prisma.channel.findMany({
    where: { ...base, folder: { watched: true }, OR: [{ statsCheckedAt: null }, { statsCheckedAt: { lt: hourAgo } }] },
    select: { id: true, externalId: true },
    orderBy: { statsCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: 500,
  });
  const daily = await prisma.channel.findMany({
    where: { ...base, OR: [{ historyDate: null }, { historyDate: { lt: today } }] },
    select: { id: true, externalId: true },
    orderBy: { statsCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: 1000,
  });
  const byExt = new Map<string, string>();
  for (const c of [...watched, ...daily]) byExt.set(c.externalId, c.id);
  const exts = [...byExt.keys()];

  await pool(chunks(exts, 50), 4, async (slice) => {
    if (!canSpend(1)) return;
    const stats = await fetchChannelStats(slice);
    spend(1);
    const got = new Set(stats.map((s) => s.id));
    const gone = slice.filter((x) => !got.has(x)).map((x) => byExt.get(x)!);
    if (stats.length) await applyChannelStats(stats, byExt, today);
    if (gone.length) {
      // 채널이 없어짐(삭제·정지) — 끈다
      await prisma.channel.updateMany({ where: { id: { in: gone } }, data: { isActive: false, statsCheckedAt: new Date() } });
      report.channelsGone += gone.length;
    }
    report.channelsChecked += stats.length;
  });
}

async function applyChannelStats(
  stats: Awaited<ReturnType<typeof fetchChannelStats>>,
  byExt: Map<string, string>,
  today: Date
) {
  const ids = stats.map((s) => byExt.get(s.id)!);
  const subs = stats.map((s) => s.subscriberCount);
  const views = stats.map((s) => (s.viewCount == null ? null : s.viewCount.toString()));
  const vcs = stats.map((s) => s.videoCount);
  const titles = stats.map((s) => s.title);
  const thumbs = stats.map((s) => s.thumbnailUrl);
  const created = stats.map((s) => s.createdAt);
  const day = today.toISOString().slice(0, 10);

  // ① 숫자 갱신 + 오늘 처음이면 기록에 덧붙인다 (빠진 날은 null 로 채워 하루치 증가분이 부풀지 않게)
  await prisma.$executeRaw`
    UPDATE "Channel" c SET
      "subscriberCount" = COALESCE(u.subs, c."subscriberCount"),
      "totalViewCount"  = COALESCE(u.views, c."totalViewCount"),
      "videoCount"      = COALESCE(u.vc, c."videoCount"),
      "displayName"     = COALESCE(c."displayName", u.title),
      "thumbnailUrl"    = COALESCE(u.thumb, c."thumbnailUrl"),
      "channelCreatedAt" = COALESCE(c."channelCreatedAt", u.created),
      "statsCheckedAt"  = NOW(),
      "lastUploadAt" = CASE
        WHEN u.vc IS NOT NULL AND c."videoCount" IS NOT NULL AND u.vc > c."videoCount"
             AND (c."lastUploadAt" IS NULL OR c."lastUploadAt" < NOW() - INTERVAL '1 hour')
        THEN NOW() ELSE c."lastUploadAt" END,
      "dailyViewsPrev" = CASE WHEN c."historyDate" IS DISTINCT FROM ${day}::date THEN c."dailyViews" ELSE c."dailyViewsPrev" END,
      "viewHistory" = CASE WHEN c."historyDate" IS DISTINCT FROM ${day}::date THEN (
          c."viewHistory"
          || array_fill(NULL::bigint, ARRAY[CASE WHEN c."historyDate" IS NULL THEN 0 ELSE LEAST(GREATEST(${day}::date - c."historyDate" - 1, 0), 30) END])
          || ARRAY[u.views]
        )[GREATEST(1, cardinality(c."viewHistory") + 2 + CASE WHEN c."historyDate" IS NULL THEN 0 ELSE LEAST(GREATEST(${day}::date - c."historyDate" - 1, 0), 30) END - 31):]
        ELSE c."viewHistory" END,
      "videoCountHistory" = CASE WHEN c."historyDate" IS DISTINCT FROM ${day}::date THEN (
          c."videoCountHistory"
          || array_fill(NULL::int, ARRAY[CASE WHEN c."historyDate" IS NULL THEN 0 ELSE LEAST(GREATEST(${day}::date - c."historyDate" - 1, 0), 30) END])
          || ARRAY[u.vc]
        )[GREATEST(1, cardinality(c."videoCountHistory") + 2 + CASE WHEN c."historyDate" IS NULL THEN 0 ELSE LEAST(GREATEST(${day}::date - c."historyDate" - 1, 0), 30) END - 31):]
        ELSE c."videoCountHistory" END,
      "historyDate" = ${day}::date
    FROM unnest(
      ${ids}::text[], ${subs}::int[], ${views}::bigint[], ${vcs}::int[],
      ${titles}::text[], ${thumbs}::text[], ${created}::timestamp[]
    ) AS u(id, subs, views, vc, title, thumb, created)
    WHERE c.id = u.id`;

  // ② 기록으로 하루·7일·30일 조회수와 주당 업로드를 다시 낸다.
  //    기록이 하나뿐이면 하루 조회수는 그대로 둔다 (pint 에서 받은 값으로 시작)
  await prisma.$executeRaw`
    WITH x AS (
      SELECT id, "viewHistory" v, "videoCountHistory" vc, cardinality("viewHistory") n
      FROM "Channel" WHERE id = ANY(${ids}::text[])
    )
    UPDATE "Channel" c SET
      "dailyViews" = CASE WHEN x.n >= 2 AND x.v[x.n] IS NOT NULL AND x.v[x.n - 1] IS NOT NULL
        THEN LEAST(GREATEST(x.v[x.n] - x.v[x.n - 1], 0), ${INT_MAX})::int ELSE c."dailyViews" END,
      "weekViews" = CASE WHEN x.n >= 8 AND x.v[x.n] IS NOT NULL AND x.v[x.n - 7] IS NOT NULL
        THEN GREATEST(x.v[x.n] - x.v[x.n - 7], 0) ELSE NULL END,
      "monthViews" = CASE WHEN x.n >= 31 AND x.v[x.n] IS NOT NULL AND x.v[x.n - 30] IS NOT NULL
        THEN GREATEST(x.v[x.n] - x.v[x.n - 30], 0) ELSE NULL END,
      "weeklyUploads" = CASE WHEN x.n >= 8 AND x.vc[x.n] IS NOT NULL AND x.vc[GREATEST(1, x.n - 28)] IS NOT NULL
        THEN GREATEST(x.vc[x.n] - x.vc[GREATEST(1, x.n - 28)], 0)::float / ((x.n - GREATEST(1, x.n - 28))::float / 7)
        ELSE c."weeklyUploads" END
    FROM x WHERE c.id = x.id`;
}

/* ───────────── 2. 새 영상 찾기 (관심 목록 채널) ───────────── */

async function stepUploadScan(report: CollectReport, canSpend: (u: number) => boolean, spend: (u: number) => void) {
  const dayAgo = new Date(Date.now() - 24 * H);
  const candidates = await prisma.$queryRaw<{ id: string; externalId: string; videoCount: number | null; first: boolean }[]>`
    SELECT c.id, c."externalId", c."videoCount", (c."uploadsCheckedAt" IS NULL) AS first
    FROM "Channel" c JOIN "Folder" f ON f.id = c."folderId"
    WHERE f.watched AND c."isActive" AND c.platform = 'YOUTUBE' AND c."externalId" LIKE 'UC%'
      AND (c."uploadsCheckedAt" IS NULL
        OR c."uploadsCheckedAt" < ${dayAgo}
        OR (c."videoCount" IS NOT NULL AND c."videoCount" > COALESCE(c."uploadsSeenCount", 0)))
    ORDER BY c."uploadsCheckedAt" ASC NULLS FIRST
    LIMIT 150`;
  if (!candidates.length) return;

  const newIds: string[] = [];
  const owner = new Map<string, string>();
  const scanned: typeof candidates = [];
  await pool(candidates, 6, async (ch) => {
    if (!canSpend(2)) return;
    // 처음 보는 채널은 50개 — 7~30일 된 영상으로 채널 평소 조회(중앙값)를 바로 낼 수 있게
    const ids = await fetchLatestUploadIds(ch.externalId, ch.first ? 50 : 15).catch((e) => {
      if (e instanceof QuotaGoneError) throw e;
      return [] as string[];
    });
    spend(1);
    scanned.push(ch);
    for (const id of ids) owner.set(id, ch.id);
    newIds.push(...ids);
  });
  report.uploadScans = scanned.length;

  if (newIds.length) {
    const known = new Set(
      (await prisma.radarVideo.findMany({ where: { id: { in: newIds } }, select: { id: true } })).map((v) => v.id)
    );
    const fresh = [...new Set(newIds.filter((id) => !known.has(id)))];
    if (fresh.length) {
      const units = Math.ceil(fresh.length / 50);
      spend(units);
      const vids = await fetchVideos(fresh);
      const cutoff = Date.now() - 30 * 24 * H;
      const nowMin = toMin(new Date());
      const rows = vids
        .filter((v) => !v.upcoming && v.publishedAt.getTime() >= cutoff)
        .map((v) => ({
          id: v.id,
          channelId: owner.get(v.id)!,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          publishedAt: v.publishedAt,
          durationSec: v.durationSec,
          isShorts: v.isShorts,
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          tags: v.tags,
          trackT: [nowMin],
          trackV: [v.views],
          ...gainsFor(v.publishedAt, [nowMin], [v.views], nowMin),
          checkedAt: new Date(),
        }));
      if (rows.length) {
        const r = await prisma.radarVideo.createMany({ data: rows, skipDuplicates: true });
        report.newVideos += r.count;
      }
    }
  }

  // 본 채널: 본 시각·그때 영상 수·마지막 업로드
  for (const ch of scanned) {
    const latest = await prisma.radarVideo.findFirst({
      where: { channelId: ch.id },
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true },
    });
    await prisma.channel.update({
      where: { id: ch.id },
      data: {
        uploadsCheckedAt: new Date(),
        uploadsSeenCount: ch.videoCount ?? undefined,
        ...(latest ? { lastUploadAt: latest.publishedAt } : {}),
      },
    });
  }
}

/* ───────────── 3. 영상 조회수 ───────────── */

/**
 * 최근 N시간 동안 늘어난 조회수.
 *  - N시간 전(또는 그보다 앞) 기록이 있으면 지금 - 그때
 *  - 영상이 N시간보다 어리면 게시 이후 전부 (게시 때 0회)
 *  - 기록이 모자라면 남은 기록으로 N시간치를 어림 (30분 이상 쌓였을 때만)
 */
function gainOver(hours: number, publishedAt: Date, t: number[], v: number[], nowMin: number): number | null {
  const n = t.length;
  if (!n) return null;
  const now = v[n - 1];
  const target = nowMin - hours * 60;
  if (toMin(publishedAt) >= target) return now;
  for (let i = n - 1; i >= 0; i--) {
    if (t[i] <= target + 5) return Math.max(0, now - v[i]);
  }
  const span = t[n - 1] - t[0];
  if (span < 30) return null;
  return Math.max(0, Math.round(((now - v[0]) * hours * 60) / span));
}

function gainsFor(publishedAt: Date, t: number[], v: number[], nowMin: number) {
  return {
    gain1h: gainOver(1, publishedAt, t, v, nowMin),
    gain3h: gainOver(3, publishedAt, t, v, nowMin),
    gain6h: gainOver(6, publishedAt, t, v, nowMin),
    gain12h: gainOver(12, publishedAt, t, v, nowMin),
    gain24h: gainOver(24, publishedAt, t, v, nowMin),
  };
}

async function stepRefreshVideos(report: CollectReport, canSpend: (u: number) => boolean, spend: (u: number) => void) {
  const due = await prisma.$queryRaw<{ id: string; publishedAt: Date; trackT: number[]; trackV: number[] }[]>`
    SELECT v.id, v."publishedAt", v."trackT", v."trackV"
    FROM "RadarVideo" v
    JOIN "Channel" c ON c.id = v."channelId"
    JOIN "Folder" f ON f.id = c."folderId"
    WHERE f.watched AND (
         (v."publishedAt" > NOW() - INTERVAL '72 hours' AND (v."checkedAt" IS NULL OR v."checkedAt" < NOW() - INTERVAL '50 minutes'))
      OR (v."publishedAt" > NOW() - INTERVAL '7 days'   AND v."checkedAt" < NOW() - INTERVAL '6 hours')
      OR (v."publishedAt" > NOW() - INTERVAL '30 days'  AND v."checkedAt" < NOW() - INTERVAL '24 hours'))
    ORDER BY v."checkedAt" ASC NULLS FIRST
    LIMIT 2500`;

  await pool(chunks(due, 50), 4, async (slice) => {
    if (!canSpend(1)) return;
    const stats = await fetchVideos(
      slice.map((v) => v.id),
      false
    );
    spend(1);
    const byId = new Map(stats.map((s) => [s.id, s]));
    const nowMin = toMin(new Date());
    const keepFrom = nowMin - 72 * 60;

    const ids: string[] = [];
    const views: number[] = [];
    const likes: (number | null)[] = [];
    const comments: (number | null)[] = [];
    const tT: string[] = [];
    const tV: string[] = [];
    const g: (number | null)[][] = [[], [], [], [], []];
    const gone: string[] = [];
    for (const row of slice) {
      const s = byId.get(row.id);
      if (!s) {
        gone.push(row.id);
        continue;
      }
      // 72시간 넘은 기록은 버리되, 24시간 전 비교용으로 바로 앞 하나는 남긴다
      let t = [...row.trackT, nowMin];
      let v = [...row.trackV, s.views];
      const firstKeep = t.findIndex((x) => x >= keepFrom);
      if (firstKeep > 1) {
        t = t.slice(firstKeep - 1);
        v = v.slice(firstKeep - 1);
      }
      const gains = gainsFor(row.publishedAt, t, v, nowMin);
      ids.push(row.id);
      views.push(s.views);
      likes.push(s.likes);
      comments.push(s.comments);
      tT.push(`{${t.join(',')}}`);
      tV.push(`{${v.join(',')}}`);
      g[0].push(gains.gain1h);
      g[1].push(gains.gain3h);
      g[2].push(gains.gain6h);
      g[3].push(gains.gain12h);
      g[4].push(gains.gain24h);
    }
    if (ids.length) {
      await prisma.$executeRaw`
        UPDATE "RadarVideo" r SET
          views = u.views, likes = COALESCE(u.likes, r.likes), comments = COALESCE(u.comments, r.comments),
          "trackT" = u.tt::int[], "trackV" = u.tv::int[],
          "gain1h" = u.g1, "gain3h" = u.g3, "gain6h" = u.g6, "gain12h" = u.g12, "gain24h" = u.g24,
          "checkedAt" = NOW()
        FROM unnest(
          ${ids}::text[], ${views}::int[], ${likes}::int[], ${comments}::int[], ${tT}::text[], ${tV}::text[],
          ${g[0]}::int[], ${g[1]}::int[], ${g[2]}::int[], ${g[3]}::int[], ${g[4]}::int[]
        ) AS u(id, views, likes, comments, tt, tv, g1, g3, g6, g12, g24)
        WHERE r.id = u.id`;
      report.videosRefreshed += ids.length;
    }
    if (gone.length) {
      // 삭제·비공개된 영상
      await prisma.radarVideo.deleteMany({ where: { id: { in: gone } } });
      report.videosGone += gone.length;
    }
  });
}

/* ───────────── 4. 하루 정리 ───────────── */

/** KST 새벽 4시 이후 하루 한 번. 했으면 true */
async function stepDailyMaintenance(): Promise<boolean> {
  const today = kstToday().toISOString().slice(0, 10);
  const kstHour = new Date(Date.now() + 9 * H).getUTCHours();
  if (kstHour < 4) return false;
  const mark = await prisma.trendCache.findUnique({ where: { key: 'radar:maintenance' } }).catch(() => null);
  if ((mark?.payload as { day?: string } | null)?.day === today) return false;

  // 채널 평소 조회 — 7~30일 된 영상 조회수 중앙값 (5개 이상일 때)
  await prisma.$executeRaw`
    UPDATE "Channel" c SET "baselineMedian" = b.med
    FROM (
      SELECT "channelId", percentile_cont(0.5) WITHIN GROUP (ORDER BY views)::int AS med
      FROM "RadarVideo"
      WHERE "publishedAt" BETWEEN NOW() - INTERVAL '30 days' AND NOW() - INTERVAL '7 days'
      GROUP BY "channelId" HAVING COUNT(*) >= 5
    ) b
    WHERE c.id = b."channelId"`;
  // 쇼츠/롱폼 — 최근 30일 영상 중 쇼츠 비율
  await prisma.$executeRaw`
    UPDATE "Channel" c SET "contentFormat" = CASE WHEN s.r >= 0.8 THEN 'shorts' WHEN s.r <= 0.2 THEN 'long' ELSE 'hybrid' END
    FROM (
      SELECT "channelId", AVG(CASE WHEN "isShorts" THEN 1 ELSE 0 END) AS r
      FROM "RadarVideo" WHERE "publishedAt" > NOW() - INTERVAL '30 days'
      GROUP BY "channelId" HAVING COUNT(*) >= 3
    ) s
    WHERE c.id = s."channelId"`;
  await prisma.radarVideo.deleteMany({ where: { publishedAt: { lt: new Date(Date.now() - 35 * 24 * H) } } });

  await prisma.trendCache.upsert({
    where: { key: 'radar:maintenance' },
    create: { key: 'radar:maintenance', payload: { day: today } },
    update: { payload: { day: today }, fetchedAt: new Date() },
  });
  return true;
}

/* ───────────── 5. 과거 트래픽 ───────────── */

/** 마지막 업로드가 이만큼 지나면 끊긴 채널 */
export const DEAD_DAYS = 60;
/** 과거 트래픽으로 남기는 영상 기준 */
export const HIT_VIEWS = 1_000_000;
/** 관심 목록 채널 하나를 하루 추적하는 데 드는 할당량 어림 (lib/radar/queries 와 같은 값) */
const UNITS_PER_WATCHED_CHANNEL = 5.5;

/** 과거 트래픽에 하루 쓸 몫 — 키 한도 합의 90% 에서 관심 목록 추적 몫과 남겨 둘 몫을 뺀 것 */
async function archiveDailyCap(): Promise<number> {
  const [keys, watched] = await Promise.all([
    prisma.youtubeApiKey.findMany({ where: { isActive: true }, select: { dailyQuotaLimit: true } }),
    prisma.channel.count({ where: { isActive: true, platform: 'YOUTUBE', folder: { watched: true } } }),
  ]);
  const limit = keys.reduce((a, k) => a + k.dailyQuotaLimit, 0);
  return Math.max(0, Math.floor(limit * 0.9 - (watched * UNITS_PER_WATCHED_CHANNEL + 600) - RESERVE_UNITS));
}

async function stepArchive(report: CollectReport, canSpend: (u: number) => boolean, spend: (u: number) => void) {
  const day = kstToday().toISOString().slice(0, 10);
  const mark = await prisma.trendCache.findUnique({ where: { key: 'radar:archive-day' } }).catch(() => null);
  const prev = mark?.payload as { day?: string; units?: number } | null;
  let used = prev?.day === day ? prev.units ?? 0 : 0;
  const cap = await archiveDailyCap();
  if (used >= cap) return;
  const use = (u: number) => {
    spend(u);
    used += u;
  };
  const room = (u: number) => used + u <= cap && canSpend(u);

  try {
    const dead = await prisma.channel.findMany({
      where: {
        platform: 'YOUTUBE',
        kind: 'REFERENCE',
        externalId: { startsWith: 'UC' },
        lastUploadAt: { lt: new Date(Date.now() - DEAD_DAYS * 24 * H) },
      },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        thumbnailUrl: true,
        subscriberCount: true,
        contentFormat: true,
        lastUploadAt: true,
        folder: { select: { name: true } },
      },
      // 큰 채널부터 — 100만+ 영상이 있을 가능성이 높다
      orderBy: { subscriberCount: { sort: 'desc', nulls: 'last' } },
      take: 50,
    });
    if (!dead.length || !room(1)) return;
    const stats = await fetchChannelStats(dead.map((d) => d.externalId));
    use(1);
    const statBy = new Map(stats.map((st) => [st.id, st]));

    for (const ch of dead) {
      const st = statBy.get(ch.externalId);
      const hits: YtVideo[] = [];
      // 총 조회가 100만도 안 되면 100만 영상이 있을 수 없다 — 바로 보관
      if (st?.viewCount != null && st.viewCount >= BigInt(HIT_VIEWS)) {
        // 쇼츠 채널은 인기 쇼츠만, 롱폼 채널은 인기 영상만, 섞인 채널은 둘 다
        const lists = ch.contentFormat === 'shorts' ? ['UUPS'] : ch.contentFormat === 'long' ? ['UULP'] : ['UUPS', 'UULP'];
        for (const pre of lists) {
          let token: string | undefined;
          for (let page = 0; page < 4; page++) {
            if (!room(2)) return;
            const { ids, next } = await fetchPlaylistPage(pre + ch.externalId.slice(2), token);
            use(1);
            if (!ids.length) break;
            const vids = await fetchVideos(ids);
            use(Math.ceil(ids.length / 50));
            const big = vids.filter((v) => v.views >= HIT_VIEWS);
            hits.push(...big.map((v) => (pre === 'UUPS' ? { ...v, isShorts: true } : v)));
            // 조회순이라 100만 아래가 나오면 뒤는 볼 필요 없다
            if (big.length < vids.length || !next) break;
            token = next;
          }
        }
      }
      const unique = [...new Map(hits.map((v) => [v.id, v])).values()];
      await prisma.$transaction([
        prisma.pastHit.createMany({
          data: unique.map((v) => ({
            id: v.id,
            channelExternalId: ch.externalId,
            channelName: st?.title ?? ch.displayName,
            channelThumb: st?.thumbnailUrl ?? ch.thumbnailUrl,
            folder: ch.folder.name,
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            publishedAt: v.publishedAt,
            durationSec: v.durationSec,
            isShorts: v.isShorts,
            views: v.views,
            likes: v.likes,
            comments: v.comments,
            tags: v.tags,
          })),
          skipDuplicates: true,
        }),
        prisma.archivedChannel.upsert({
          where: { externalId: ch.externalId },
          create: {
            externalId: ch.externalId,
            name: st?.title ?? ch.displayName,
            thumbnailUrl: st?.thumbnailUrl ?? ch.thumbnailUrl,
            folder: ch.folder.name,
            subscriberCount: st?.subscriberCount ?? ch.subscriberCount,
            totalViewCount: st?.viewCount ?? null,
            lastUploadAt: ch.lastUploadAt,
            hits: unique.length,
          },
          update: { hits: unique.length, archivedAt: new Date(), folder: ch.folder.name },
        }),
        prisma.channel.delete({ where: { id: ch.id } }),
      ]);
      report.archivedChannels += 1;
      report.pastHits += unique.length;
    }
  } finally {
    await prisma.trendCache
      .upsert({
        where: { key: 'radar:archive-day' },
        create: { key: 'radar:archive-day', payload: { day, units: used } },
        update: { payload: { day, units: used }, fetchedAt: new Date() },
      })
      .catch(() => {});
  }
}

export const _test = { gainOver, kstToday };
