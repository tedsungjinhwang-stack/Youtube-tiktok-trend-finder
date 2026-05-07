import { prisma } from '@/lib/db';
import type { Platform, VideoFormat, Prisma } from '@prisma/client';

export type VideoFilters = {
  folderId?: string;
  folderName?: string;
  platform?: Platform;
  platforms?: Platform[];
  period?: '24h' | '48h' | '7d' | '30d' | 'all';
  /** publishedAt이 minAgeDays보다 오래된 영상만 (심정지/리바이벌 용) */
  minAgeDays?: number;
  sortBy?: 'viralScore' | 'views' | 'publishedAt';
  minScore?: number;
  pctScore?: number;
  minViews?: number;
  q?: string;
  format?: VideoFormat;
  isShorts?: boolean;
  cursor?: string;
  limit?: number;
};

export type VideoRow = {
  id: string;
  platform: Platform;
  externalId: string;
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  viewCount: string;
  likeCount: number | null;
  durationSeconds: number | null;
  isShorts: boolean | null;
  publishedAt: Date;
  viralScore: number | null;
  channelName: string | null;
  channelHandle: string | null;
  folder: string;
};

export type VideoQueryResult = {
  rows: VideoRow[];
  scoreThreshold: number | null;
  nextCursor: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function queryVideos(filters: VideoFilters): Promise<VideoQueryResult> {
  const period = filters.period ?? '7d';
  const sortBy = filters.sortBy ?? 'viralScore';
  const minViews = filters.minViews ?? 50_000;
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);

  const sinceMap: Record<string, Date | null> = {
    '24h': new Date(Date.now() - DAY_MS),
    '48h': new Date(Date.now() - 2 * DAY_MS),
    '7d': new Date(Date.now() - 7 * DAY_MS),
    '30d': new Date(Date.now() - 30 * DAY_MS),
    all: null,
  };
  const since = sinceMap[period];
  const before =
    filters.minAgeDays != null
      ? new Date(Date.now() - filters.minAgeDays * DAY_MS)
      : null;

  const folderId =
    filters.folderId ??
    (filters.folderName
      ? (await prisma.folder.findUnique({ where: { name: filters.folderName } }))?.id
      : undefined);

  const platformWhere =
    filters.platforms && filters.platforms.length > 0
      ? { platform: { in: filters.platforms } }
      : filters.platform
        ? { platform: filters.platform }
        : {};

  const orderBy: Prisma.VideoOrderByWithRelationInput =
    sortBy === 'viralScore'
      ? { viralScore: 'desc' }
      : sortBy === 'views'
        ? { viewCount: 'desc' }
        : { publishedAt: 'desc' };

  const publishedAtRange: Prisma.DateTimeFilter | undefined =
    since && before
      ? { gte: since, lte: before }
      : since
        ? { gte: since }
        : before
          ? { lte: before }
          : undefined;

  const baseWhere: Prisma.VideoWhereInput = {
    ...platformWhere,
    ...(publishedAtRange ? { publishedAt: publishedAtRange } : {}),
    viewCount: { gte: BigInt(minViews) },
    // 통합/YT/Social 등 일반 페이지에서는 해시태그 발견 영상 제외 (sourceHashtag null만).
    // /popular-feed는 queryVideos를 안 쓰고 prisma 직접 호출하므로 영향 없음.
    sourceHashtag: null,
    ...(folderId
      ? { channel: { folderId } }
      : { channel: { folder: { name: { not: { startsWith: '__' } } } } }),
    ...(filters.q
      ? { caption: { contains: filters.q, mode: 'insensitive' as const } }
      : {}),
    ...(filters.format ? { format: filters.format } : {}),
    ...(filters.isShorts != null ? { isShorts: filters.isShorts } : {}),
  };

  let scoreThreshold = filters.minScore;
  if (filters.pctScore != null && scoreThreshold == null) {
    const scored = await prisma.video.findMany({
      where: { ...baseWhere, viralScore: { not: null } },
      select: { viralScore: true },
    });
    scoreThreshold = percentile(
      scored.map((v) => v.viralScore!).sort((a, b) => a - b),
      filters.pctScore
    );
  }

  const rows = await prisma.video.findMany({
    where: {
      ...baseWhere,
      ...(scoreThreshold != null ? { viralScore: { gte: scoreThreshold } } : {}),
    },
    orderBy,
    take: limit,
    ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    include: {
      channel: {
        select: {
          displayName: true,
          handle: true,
          folder: { select: { name: true } },
        },
      },
    },
  });

  return {
    rows: rows.map((v) => ({
      id: v.id,
      platform: v.platform,
      externalId: v.externalId,
      url: v.url,
      title: v.caption,
      thumbnailUrl: v.thumbnailUrl,
      viewCount: v.viewCount.toString(),
      likeCount: v.likeCount,
      durationSeconds: v.durationSeconds,
      isShorts: v.isShorts,
      publishedAt: v.publishedAt,
      viralScore: v.viralScore,
      channelName: v.channel.displayName,
      channelHandle: v.channel.handle,
      folder: v.channel.folder.name,
    })),
    scoreThreshold: scoreThreshold ?? null,
    nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
  };
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const rank = (pct / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}
