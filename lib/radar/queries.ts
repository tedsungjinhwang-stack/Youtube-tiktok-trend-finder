/**
 * 꿀통레이더 — 채널 순위 · 터진 영상 · 관심 목록 화면 데이터 (수집기 lib/radar/collect 가 모은 것).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const H = 3_600_000;
const n = (v: bigint | number | null | undefined) => (v == null ? null : Number(v));

/* ───────────── 공용 ───────────── */

export type VideoBrief = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  isShorts: boolean | null;
};

export type CollectStatus = {
  lastRunAt: string | null;
  quotaLeft: number | null;
  stoppedBy: string | null;
  watchedChannels: number;
  trackedVideos: number;
};

export async function getCollectStatus(): Promise<CollectStatus> {
  const [last, watchedChannels, trackedVideos] = await Promise.all([
    prisma.trendCache.findUnique({ where: { key: 'radar:last-collect' } }).catch(() => null),
    prisma.channel.count({ where: { isActive: true, platform: 'YOUTUBE', folder: { watched: true } } }).catch(() => 0),
    prisma.radarVideo.count({ where: { publishedAt: { gt: new Date(Date.now() - 7 * 24 * H) } } }).catch(() => 0),
  ]);
  const p = (last?.payload ?? null) as { quotaLeft?: number | null; stoppedBy?: string | null } | null;
  return {
    lastRunAt: last?.fetchedAt.toISOString() ?? null,
    quotaLeft: p?.quotaLeft ?? null,
    stoppedBy: p?.stoppedBy ?? null,
    watchedChannels,
    trackedVideos,
  };
}

/* ───────────── 채널 순위 (pint 홈) ───────────── */

export type RankPeriod = '24h' | '7d' | '30d' | 'accel';
export type RankFormat = 'all' | 'shorts' | 'long';

export type RankingQuery = {
  format: RankFormat;
  period: RankPeriod;
  /** 구독 100만+ 대형 채널 빼기 */
  excludeWhale: boolean;
  folderId: string | null;
  watchedOnly: boolean;
  q: string;
  offset: number;
};

export type RankingRow = {
  id: string;
  externalId: string;
  name: string;
  thumbnailUrl: string | null;
  folder: string;
  folderId: string;
  watched: boolean;
  contentFormat: string | null;
  subscriberCount: number | null;
  totalViews: number | null;
  createdAt: string | null;
  dailyViews: number | null;
  dailyViewsPrev: number | null;
  weekViews: number | null;
  monthViews: number | null;
  weeklyUploads: number | null;
  lastUploadAt: string | null;
  rank: number;
  /** 어제 하루 조회수 기준 순위 (24시간 순위에서만) */
  prevRank: number | null;
  /** 최근 7일 하루 조회수 (오래된 → 최신). 기록이 모자라면 짧다 */
  spark: number[];
  top: VideoBrief | null;
  latest: VideoBrief | null;
};

export type RankingResult = { rows: RankingRow[]; total: number; hasMore: boolean; historyDays: number };

const PAGE = 30;

export async function getRanking(q: RankingQuery): Promise<RankingResult> {
  const where: Prisma.Sql[] = [
    Prisma.sql`c."isActive"`,
    Prisma.sql`c.platform = 'YOUTUBE'`,
    Prisma.sql`f.name NOT LIKE '\\_\\_%'`,
  ];
  if (q.format === 'shorts') where.push(Prisma.sql`c."contentFormat" IN ('shorts', 'hybrid')`);
  if (q.format === 'long') where.push(Prisma.sql`c."contentFormat" IN ('long', 'hybrid')`);
  if (q.excludeWhale) where.push(Prisma.sql`COALESCE(c."subscriberCount", 0) < 1000000`);
  if (q.folderId) where.push(Prisma.sql`c."folderId" = ${q.folderId}`);
  if (q.watchedOnly) where.push(Prisma.sql`f.watched`);
  const s = q.q.trim();
  if (s) where.push(Prisma.sql`(c."displayName" ILIKE ${'%' + s + '%'} OR c.handle ILIKE ${'%' + s + '%'})`);
  const cond = Prisma.join(where, ' AND ');

  const metric =
    q.period === '7d'
      ? Prisma.sql`c."weekViews"`
      : q.period === '30d'
        ? Prisma.sql`c."monthViews"`
        : q.period === 'accel'
          ? // 오늘 하루 조회가 최근 평소(7일 평균, 없으면 어제)보다 몇 배인지 — 하루 1만 미만은 빼고
            Prisma.sql`CASE WHEN c."dailyViews" >= 10000 THEN c."dailyViews"::float / NULLIF(COALESCE(c."weekViews"::float / 7, c."dailyViewsPrev"::float), 0) END`
          : Prisma.sql`c."dailyViews"`;

  const rows = await prisma.$queryRaw<
    {
      id: string;
      externalId: string;
      displayName: string | null;
      handle: string | null;
      thumbnailUrl: string | null;
      folder: string;
      folderId: string;
      watched: boolean;
      contentFormat: string | null;
      subscriberCount: number | null;
      totalViewCount: bigint | null;
      channelCreatedAt: Date | null;
      dailyViews: number | null;
      dailyViewsPrev: number | null;
      weekViews: bigint | null;
      monthViews: bigint | null;
      weeklyUploads: number | null;
      lastUploadAt: Date | null;
      viewHistory: (bigint | null)[];
      rank: bigint;
      prevRank: bigint | null;
      total: bigint;
    }[]
  >`
    WITH base AS (
      SELECT c.*, f.name AS folder, f.watched, ${metric} AS metric
      FROM "Channel" c JOIN "Folder" f ON f.id = c."folderId"
      WHERE ${cond}
    ), ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (ORDER BY metric DESC NULLS LAST, "subscriberCount" DESC NULLS LAST) AS rank,
        CASE WHEN "dailyViewsPrev" IS NOT NULL
          THEN ROW_NUMBER() OVER (ORDER BY "dailyViewsPrev" DESC NULLS LAST) END AS "prevRank",
        COUNT(*) OVER () AS total
      FROM base
    )
    SELECT id, "externalId", "displayName", handle, "thumbnailUrl", folder, "folderId", watched, "contentFormat",
      "subscriberCount", "totalViewCount", "channelCreatedAt", "dailyViews", "dailyViewsPrev", "weekViews", "monthViews",
      "weeklyUploads", "lastUploadAt", "viewHistory", rank, "prevRank", total
    FROM ranked
    ORDER BY rank
    OFFSET ${q.offset} LIMIT ${PAGE + 1}`;

  const page = rows.slice(0, PAGE);
  const ids = page.map((r) => r.id);
  const [tops, latests] = ids.length
    ? await Promise.all([
        prisma.$queryRaw<(VideoBrief & { channelId: string; publishedAt: Date })[]>`
          SELECT DISTINCT ON ("channelId") "channelId", id, title, "thumbnailUrl", "publishedAt", views, "isShorts"
          FROM "RadarVideo"
          WHERE "channelId" = ANY(${ids}::text[]) AND "publishedAt" > NOW() - INTERVAL '14 days'
          ORDER BY "channelId", views DESC`,
        prisma.$queryRaw<(VideoBrief & { channelId: string; publishedAt: Date })[]>`
          SELECT DISTINCT ON ("channelId") "channelId", id, title, "thumbnailUrl", "publishedAt", views, "isShorts"
          FROM "RadarVideo"
          WHERE "channelId" = ANY(${ids}::text[])
          ORDER BY "channelId", "publishedAt" DESC`,
      ])
    : [[], []];
  const brief = (v: VideoBrief & { publishedAt: Date | string }): VideoBrief => ({
    id: v.id,
    title: v.title,
    thumbnailUrl: v.thumbnailUrl,
    publishedAt: new Date(v.publishedAt).toISOString(),
    views: Number(v.views),
    isShorts: v.isShorts,
  });
  const topBy = new Map(tops.map((v) => [v.channelId, brief(v)]));
  const latestBy = new Map(latests.map((v) => [v.channelId, brief(v)]));

  let historyDays = 0;
  const out: RankingRow[] = page.map((r) => {
    const hist = r.viewHistory.map((x) => (x == null ? null : Number(x)));
    historyDays = Math.max(historyDays, hist.length);
    const spark: number[] = [];
    for (let i = Math.max(1, hist.length - 7); i < hist.length; i++) {
      const a = hist[i - 1];
      const b = hist[i];
      spark.push(a != null && b != null ? Math.max(0, b - a) : 0);
    }
    return {
      id: r.id,
      externalId: r.externalId,
      name: r.displayName ?? r.handle ?? r.externalId,
      thumbnailUrl: r.thumbnailUrl,
      folder: r.folder,
      folderId: r.folderId,
      watched: r.watched,
      contentFormat: r.contentFormat,
      subscriberCount: r.subscriberCount,
      totalViews: n(r.totalViewCount),
      createdAt: r.channelCreatedAt?.toISOString() ?? null,
      dailyViews: r.dailyViews,
      dailyViewsPrev: r.dailyViewsPrev,
      weekViews: n(r.weekViews),
      monthViews: n(r.monthViews),
      weeklyUploads: r.weeklyUploads,
      lastUploadAt: r.lastUploadAt?.toISOString() ?? null,
      rank: Number(r.rank),
      prevRank: q.period === '24h' && r.prevRank != null ? Number(r.prevRank) : null,
      spark,
      top: topBy.get(r.id) ?? null,
      latest: latestBy.get(r.id) ?? null,
    };
  });

  return { rows: out, total: rows.length ? Number(rows[0].total) : 0, hasMore: rows.length > PAGE, historyDays };
}

/* ───────────── 터진 영상 ───────────── */

export type HotWindow = 1 | 3 | 6 | 12 | 24;
export type HotSort = 'rising' | 'views' | 'latest';

export type HotQuery = { format: 'shorts' | 'long'; window: HotWindow; sort: HotSort; excludeWhale: boolean };

export type HotVideo = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  /** 고른 시간 동안 늘어난 조회 */
  gain: number | null;
  /** 시간당 (고른 시간 기준) */
  perHour: number | null;
  /** 게시 이후 시간당 평균 */
  avgPerHour: number;
  /** 가속 — 최근 1시간 증가 ÷ 게시 이후 시간당 평균 */
  accel: number | null;
  /** 채널 평소(7~30일 된 영상 중앙값)의 몇 배 */
  multiple: number | null;
  channelId: string;
  channelExternalId: string;
  channelName: string;
  channelThumb: string | null;
  folder: string;
  folderId: string;
  badges: string[];
};

export type HotResult = { items: HotVideo[]; folders: { id: string; name: string; count: number }[]; status: CollectStatus };

export async function getHotVideos(q: HotQuery): Promise<HotResult> {
  const gainCol = Prisma.raw(`"gain${q.window}h"`);
  const conds: Prisma.Sql[] = [
    Prisma.sql`f.watched`,
    Prisma.sql`c."isActive"`,
    Prisma.sql`v."isShorts" = ${q.format === 'shorts'}`,
  ];
  if (q.excludeWhale) conds.push(Prisma.sql`COALESCE(c."subscriberCount", 0) < 1000000`);
  if (q.sort === 'rising') {
    // 오래된 조회수로 순위를 매기지 않게 — 최근 3시간 안에 잰 것만
    conds.push(Prisma.sql`v."checkedAt" > NOW() - INTERVAL '3 hours'`);
    conds.push(Prisma.sql`v."publishedAt" > NOW() - INTERVAL '30 days'`);
  } else {
    conds.push(Prisma.sql`v."publishedAt" > NOW() - INTERVAL '7 days'`);
  }
  const order =
    q.sort === 'rising'
      ? Prisma.sql`v.${gainCol} DESC NULLS LAST`
      : q.sort === 'views'
        ? Prisma.sql`v.views DESC`
        : Prisma.sql`v."publishedAt" DESC`;

  const rows = await prisma.$queryRaw<
    {
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
    }[]
  >`
    SELECT v.id, v.title, v."thumbnailUrl", v."publishedAt", v.views, v.${gainCol} AS gain, v."gain1h",
      c."baselineMedian", c.id AS "channelId", c."externalId", c."displayName", c."thumbnailUrl" AS "channelThumb",
      f.name AS folder, f.id AS "folderId"
    FROM "RadarVideo" v
    JOIN "Channel" c ON c.id = v."channelId"
    JOIN "Folder" f ON f.id = c."folderId"
    WHERE ${Prisma.join(conds, ' AND ')}
    ORDER BY ${order}
    LIMIT 200`;

  const now = Date.now();
  const items: HotVideo[] = rows.map((r, i) => {
    const ageH = Math.max((now - r.publishedAt.getTime()) / H, 0.25);
    const avgPerHour = r.views / ageH;
    const perHour = r.gain == null ? null : r.gain / Math.min(q.window, ageH);
    const accel = r.gain1h != null && avgPerHour > 0 ? r.gain1h / Math.min(1, ageH) / avgPerHour : null;
    const multiple = r.baselineMedian && r.baselineMedian > 0 ? r.views / r.baselineMedian : null;
    const badges: string[] = [];
    if (q.sort === 'rising' && i < 3 && (r.gain ?? 0) > 0) badges.push('Hot');
    if (ageH < 6) badges.push('초신규');
    if (accel != null && accel >= 1.5 && (r.gain1h ?? 0) >= 10_000) badges.push('가속');
    if (ageH >= 7 * 24 && (perHour ?? 0) >= 5_000) badges.push('역주행');
    if (multiple != null && multiple >= 5) badges.push(`평소 ${Math.round(multiple)}배`);
    return {
      id: r.id,
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      publishedAt: r.publishedAt.toISOString(),
      views: r.views,
      gain: r.gain,
      perHour,
      avgPerHour,
      accel,
      multiple,
      channelId: r.channelId,
      channelExternalId: r.externalId,
      channelName: r.displayName ?? r.externalId,
      channelThumb: r.channelThumb,
      folder: r.folder,
      folderId: r.folderId,
      badges,
    };
  });

  const counts = new Map<string, { id: string; name: string; count: number }>();
  for (const it of items) {
    const c = counts.get(it.folderId) ?? { id: it.folderId, name: it.folder, count: 0 };
    c.count++;
    counts.set(it.folderId, c);
  }
  return {
    items,
    folders: [...counts.values()].sort((a, b) => b.count - a.count),
    status: await getCollectStatus(),
  };
}

/* ───────────── 관심 목록 ───────────── */

export type WatchFolder = {
  id: string;
  name: string;
  description: string | null;
  watched: boolean;
  active: number;
  total: number;
  /** 활성 채널 하루 조회수 합 */
  dailyViews: number;
  top: { name: string; thumbnailUrl: string | null }[];
};

export type WatchlistResult = {
  folders: WatchFolder[];
  watchedChannels: number;
  /** 관심 목록 채널을 추적하는 데 드는 하루 예상 할당량 */
  estimatedUnits: number;
  /** 등록된 유튜브 키의 하루 한도 합 */
  quotaLimit: number;
  status: CollectStatus;
};

/** 채널 하나를 관심 목록에서 추적하는 데 드는 하루 할당량 어림 (시간별 통계 0.5 + 새 영상 1~2 + 조회수 3~4) */
const UNITS_PER_WATCHED_CHANNEL = 5.5;

export async function getWatchlist(): Promise<WatchlistResult> {
  const [folders, agg, tops, keys, status] = await Promise.all([
    prisma.folder.findMany({
      select: { id: true, name: true, description: true, watched: true, sortOrder: true },
      orderBy: [{ watched: 'desc' }, { sortOrder: 'asc' }],
    }),
    prisma.$queryRaw<{ folderId: string; total: bigint; active: bigint; daily: bigint | null }[]>`
      SELECT "folderId", COUNT(*) AS total, COUNT(*) FILTER (WHERE "isActive") AS active,
        SUM("dailyViews") FILTER (WHERE "isActive") AS daily
      FROM "Channel" WHERE platform = 'YOUTUBE' GROUP BY "folderId"`,
    prisma.$queryRaw<{ folderId: string; displayName: string | null; thumbnailUrl: string | null }[]>`
      SELECT "folderId", "displayName", "thumbnailUrl" FROM (
        SELECT "folderId", "displayName", "thumbnailUrl",
          ROW_NUMBER() OVER (PARTITION BY "folderId" ORDER BY "dailyViews" DESC NULLS LAST) AS rn
        FROM "Channel" WHERE "isActive" AND platform = 'YOUTUBE'
      ) t WHERE rn <= 4`,
    prisma.youtubeApiKey.findMany({ where: { isActive: true }, select: { dailyQuotaLimit: true } }).catch(() => []),
    getCollectStatus(),
  ]);
  const aggBy = new Map(agg.map((a) => [a.folderId, a]));
  const topBy = new Map<string, { name: string; thumbnailUrl: string | null }[]>();
  for (const t of tops) {
    const list = topBy.get(t.folderId) ?? [];
    list.push({ name: t.displayName ?? '', thumbnailUrl: t.thumbnailUrl });
    topBy.set(t.folderId, list);
  }
  const out: WatchFolder[] = folders
    // 시스템 폴더(__로 시작)는 빼기 — Prisma startsWith 는 '_' 를 LIKE 와일드카드로 넘겨서 여기서 거른다
    .filter((f) => !f.name.startsWith('__'))
    .map((f) => {
      const a = aggBy.get(f.id);
      return {
        id: f.id,
        name: f.name,
        description: f.description,
        watched: f.watched,
        active: Number(a?.active ?? 0),
        total: Number(a?.total ?? 0),
        dailyViews: Number(a?.daily ?? 0),
        top: topBy.get(f.id) ?? [],
      };
    })
    .filter((f) => f.total > 0 || f.watched);
  const watchedChannels = out.filter((f) => f.watched).reduce((s, f) => s + f.active, 0);
  return {
    folders: out,
    watchedChannels,
    estimatedUnits: Math.round(watchedChannels * UNITS_PER_WATCHED_CHANNEL + 600),
    quotaLimit: keys.reduce((s, k) => s + k.dailyQuotaLimit, 0),
    status,
  };
}

/* ───────────── 과거 트래픽 ───────────── */

export type PastQuery = {
  format: 'all' | 'shorts' | 'long';
  sort: 'views' | 'recent' | 'old';
  folder: string | null;
  q: string;
  offset: number;
};

export type PastHitRow = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  isShorts: boolean;
  channelExternalId: string;
  channelName: string | null;
  channelThumb: string | null;
  folder: string | null;
};

export type PastResult = {
  rows: PastHitRow[];
  total: number;
  hasMore: boolean;
  folders: { name: string; count: number }[];
  archivedChannels: number;
  /** 아직 정리 안 한 끊긴 채널 (마지막 업로드 60일+) */
  pendingChannels: number;
};

const PAST_PAGE = 60;

export async function getPastHits(q: PastQuery): Promise<PastResult> {
  const where: Prisma.PastHitWhereInput = {
    ...(q.format === 'shorts' ? { isShorts: true } : q.format === 'long' ? { isShorts: false } : {}),
    ...(q.folder ? { folder: q.folder } : {}),
    ...(q.q.trim()
      ? {
          OR: [
            { title: { contains: q.q.trim(), mode: 'insensitive' } },
            { channelName: { contains: q.q.trim(), mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.PastHitOrderByWithRelationInput =
    q.sort === 'recent' ? { publishedAt: 'desc' } : q.sort === 'old' ? { publishedAt: 'asc' } : { views: 'desc' };
  const [rows, total, folders, archivedChannels, pendingChannels] = await Promise.all([
    prisma.pastHit.findMany({ where, orderBy, skip: q.offset, take: PAST_PAGE + 1 }),
    prisma.pastHit.count({ where }),
    prisma.pastHit.groupBy({
      by: ['folder'],
      where: q.format === 'shorts' ? { isShorts: true } : q.format === 'long' ? { isShorts: false } : {},
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take: 40,
    }),
    prisma.archivedChannel.count(),
    prisma.channel.count({
      where: {
        platform: 'YOUTUBE',
        kind: 'REFERENCE',
        lastUploadAt: { lt: new Date(Date.now() - 60 * 24 * H) },
      },
    }),
  ]);
  return {
    rows: rows.slice(0, PAST_PAGE).map((r) => ({
      id: r.id,
      title: r.title,
      thumbnailUrl: r.thumbnailUrl,
      publishedAt: r.publishedAt.toISOString(),
      views: r.views,
      isShorts: r.isShorts,
      channelExternalId: r.channelExternalId,
      channelName: r.channelName,
      channelThumb: r.channelThumb,
      folder: r.folder,
    })),
    total,
    hasMore: rows.length > PAST_PAGE,
    folders: folders.filter((f) => f.folder).map((f) => ({ name: f.folder!, count: f._count._all })),
    archivedChannels,
    pendingChannels,
  };
}
