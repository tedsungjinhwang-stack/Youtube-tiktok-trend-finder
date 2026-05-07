import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { listHashtags } from '@/lib/hashtags';
import { PopularFeedClient } from './popular-feed-client';
import { PageFilters } from '@/components/page-filters';
import { SelectableVideoGrid } from '@/components/selectable-video-grid';
import {
  BUILTIN_DEFAULTS,
  COOKIE_KEY_MIN_VIEWS,
  numFromCookie,
} from '@/lib/settings';
import type { Platform } from '@prisma/client';

export const dynamic = 'force-dynamic';

type SearchParams = {
  hashtag?: string;
  period?: '24h' | '48h' | '7d' | '30d' | 'all';
  minViews?: string;
  platforms?: string;
  sortBy?: 'viralScore' | 'views' | 'publishedAt';
};

const ALL_PLATFORMS: Platform[] = ['YOUTUBE', 'TIKTOK', 'INSTAGRAM'];
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function PopularFeedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const hashtags = await listHashtags();
  const activeTag = searchParams.hashtag ?? null;

  const c = cookies();
  const defaults = {
    minViews: numFromCookie(
      c.get(COOKIE_KEY_MIN_VIEWS)?.value,
      BUILTIN_DEFAULTS.minViews
    ),
  };

  const minViews = numOpt(searchParams.minViews) ?? defaults.minViews;
  const platforms = parsePlatforms(searchParams.platforms) ?? ALL_PLATFORMS;
  const since = sinceFromPeriod(searchParams.period ?? 'all');
  const sortBy = searchParams.sortBy ?? 'views';

  const videos = await safeFetchVideos({
    hashtag: activeTag,
    platforms,
    minViews,
    since,
    sortBy,
  });

  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">인기피드검색</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          YouTube · TikTok · Instagram 해시태그 기반 인기 피드 — 등록 후 검색 시 자동 수집.
        </p>
      </div>

      <div className="mb-4">
        <PageFilters platforms={ALL_PLATFORMS} defaults={defaults} />
      </div>

      <PopularFeedClient hashtags={hashtags} activeTag={activeTag} />

      <div className="mt-6">
        <SelectableVideoGrid
          emptyState={
            <div className="rounded-xl border border-dashed py-12 text-center text-[13.5px] text-muted-foreground">
              {activeTag
                ? `#${activeTag} 결과 없음 — "검색" 버튼으로 가져와 보세요.`
                : '해시태그 등록 → 🔍 검색 클릭하면 결과가 여기에 표시됩니다.'}
            </div>
          }
          videos={videos.map((v, i) => ({
            id: v.id,
            externalId: v.externalId,
            url: v.url,
            rank: i + 1,
            platform: v.platform as 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM',
            thumbnailUrl: v.thumbnailUrl ?? '',
            title: v.caption ?? '(제목 없음)',
            channelName: v.channelHandle ?? '?',
            folder: v.sourceHashtag ? `#${v.sourceHashtag}` : '발견',
            totalViews: Number(v.viewCount),
            publishedAt: v.publishedAt,
            hideRankBadge: true,
          }))}
        />
      </div>
    </div>
  );
}

function sinceFromPeriod(period: string): Date | null {
  switch (period) {
    case '24h':
      return new Date(Date.now() - DAY_MS);
    case '48h':
      return new Date(Date.now() - 2 * DAY_MS);
    case '7d':
      return new Date(Date.now() - 7 * DAY_MS);
    case '30d':
      return new Date(Date.now() - 30 * DAY_MS);
    default:
      return null;
  }
}

function parsePlatforms(raw?: string): Platform[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .filter((p): p is Platform => ALL_PLATFORMS.includes(p as Platform));
  return list.length > 0 ? list : undefined;
}

function numOpt(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

async function safeFetchVideos(opts: {
  hashtag: string | null;
  platforms: Platform[];
  minViews: number;
  since: Date | null;
  sortBy: 'viralScore' | 'views' | 'publishedAt';
}) {
  const orderBy =
    opts.sortBy === 'views'
      ? { viewCount: 'desc' as const }
      : opts.sortBy === 'publishedAt'
        ? { publishedAt: 'desc' as const }
        : { viewCount: 'desc' as const };
  try {
    const rows = await prisma.video.findMany({
      where: {
        sourceHashtag: opts.hashtag ? opts.hashtag : { not: null },
        platform: { in: opts.platforms },
        viewCount: { gte: BigInt(opts.minViews) },
        ...(opts.since ? { publishedAt: { gte: opts.since } } : {}),
      },
      orderBy,
      take: 100,
      include: {
        channel: { select: { handle: true, displayName: true } },
      },
    });
    return rows.map((v) => ({
      id: v.id,
      externalId: v.externalId,
      url: v.url,
      platform: v.platform,
      thumbnailUrl: v.thumbnailUrl,
      caption: v.caption,
      viewCount: v.viewCount.toString(),
      publishedAt: v.publishedAt,
      sourceHashtag: v.sourceHashtag,
      channelHandle: v.channel.displayName ?? v.channel.handle,
    }));
  } catch {
    return [];
  }
}
