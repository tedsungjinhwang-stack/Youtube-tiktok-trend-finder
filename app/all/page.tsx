import { cookies } from 'next/headers';
import { CategoryTabs } from '@/components/category-tabs';
import { PageFilters } from '@/components/page-filters';
import { PlatformPivot } from '@/components/platform-pivot';
import { SelectableVideoGrid } from '@/components/selectable-video-grid';
import { ScrapeButton } from '@/components/scrape-button';
import { queryVideos } from '@/lib/queries/videos';
import { getFoldersWithChannelCount } from '@/lib/queries/folders';
import {
  BUILTIN_DEFAULTS,
  COOKIE_KEY_MIN_VIEWS,
  numFromCookie,
} from '@/lib/settings';
import type { Platform } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ALL_PLATFORMS: Platform[] = [
  'YOUTUBE',
  'TIKTOK',
  'INSTAGRAM',
  'XIAOHONGSHU',
  'DOUYIN',
];

const PLATFORM_LABELS: Record<string, string> = {
  ALL: '통합',
  YOUTUBE: 'YouTube',
  SOCIAL: 'TikTok / Instagram',
  XIAOHONGSHU: '샤오홍수',
  DOUYIN: '도우인',
};

type SearchParams = {
  folderId?: string;
  platforms?: string;
  period?: '24h' | '48h' | '7d' | '30d' | 'all';
  sortBy?: 'viralScore' | 'views' | 'publishedAt';
  minScore?: string;
  minViews?: string;
  minAgeDays?: string;
  isShorts?: 'true' | 'false';
  kind?: 'REFERENCE' | 'SOURCE';
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // 기본값: YouTube 만 (사용자 요청)
  const platforms = parsePlatforms(searchParams.platforms) ?? ['YOUTUBE'];

  // 폴더 카운트는 현재 플랫폼 기준
  const folders = await getFoldersWithChannelCount(platforms);
  const c = cookies();
  const defaults = {
    minViews: numFromCookie(
      c.get(COOKIE_KEY_MIN_VIEWS)?.value,
      BUILTIN_DEFAULTS.minViews
    ),
  };

  const result = await safeQuery({
    folderId: searchParams.folderId,
    platforms,
    period: searchParams.period,
    minAgeDays: numOpt(searchParams.minAgeDays),
    sortBy: searchParams.sortBy,
    minViews: numOpt(searchParams.minViews) ?? defaults.minViews,
    isShorts:
      searchParams.isShorts === 'true'
        ? true
        : searchParams.isShorts === 'false'
          ? false
          : undefined,
    kind:
      searchParams.kind === 'REFERENCE' || searchParams.kind === 'SOURCE'
        ? searchParams.kind
        : undefined,
  });

  const groupLabel = detectGroupLabel(platforms);

  return (
    <>
      <CategoryTabs folders={folders} />

      <div className="px-4 py-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">영상 조회</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              플랫폼 선택 + 카테고리/기간/임계치 필터 — 현재: <b>{groupLabel}</b>
            </p>
          </div>
          <ScrapeButton
            platforms={
              platforms.length === ALL_PLATFORMS.length ? [] : platforms
            }
            label={`${groupLabel} 에셋 조회`}
          />
        </div>

        <div className="mb-3">
          <PlatformPivot platforms={platforms} />
        </div>

        <div className="mb-4">
          <PageFilters
            platforms={platforms}
            showPlatformToggle={false}
            defaults={defaults}
          />
        </div>

        <SelectableVideoGrid
          emptyState={<EmptyState />}
          videos={result.rows.map((v, i) => ({
            id: v.id,
            externalId: v.externalId,
            url: v.url,
            rank: i + 1,
            platform: v.platform,
            thumbnailUrl: v.thumbnailUrl ?? '',
            title: v.title ?? '(제목 없음)',
            channelName: v.channelName ?? '?',
            folder: v.folder,
            totalViews: Number(v.viewCount),
            publishedAt: v.publishedAt,
            channelAvgMultiplier: v.viralScore ?? undefined,
            starred: v.isStarred,
            durationSeconds: v.durationSeconds,
            isShorts: v.isShorts,
          }))}
        />
      </div>
    </>
  );
}

function detectGroupLabel(platforms: Platform[]): string {
  const set = new Set(platforms);
  if (set.size === ALL_PLATFORMS.length) return PLATFORM_LABELS.ALL;
  if (set.size === 1) {
    const only = platforms[0];
    if (only === 'YOUTUBE') return PLATFORM_LABELS.YOUTUBE;
    if (only === 'XIAOHONGSHU') return PLATFORM_LABELS.XIAOHONGSHU;
    if (only === 'DOUYIN') return PLATFORM_LABELS.DOUYIN;
  }
  if (set.size === 2 && set.has('TIKTOK') && set.has('INSTAGRAM'))
    return PLATFORM_LABELS.SOCIAL;
  return '커스텀';
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">표시할 영상이 없습니다</p>
      <p className="mt-1 text-xs">
        채널을 추가하고 스크래핑하면 여기에 트렌드 영상이 표시됩니다 —
        <a href="/channels" className="ml-1 underline hover:text-foreground">
          채널 추가하러 가기
        </a>
      </p>
      <p className="mt-1 text-xs">또는 위 필터 조건을 완화해보세요.</p>
    </div>
  );
}

function parsePlatforms(raw?: string): Platform[] | undefined {
  if (!raw) return undefined;
  const list = raw.split(',').filter((p): p is Platform =>
    ALL_PLATFORMS.includes(p as Platform)
  );
  return list.length > 0 ? list : undefined;
}

function numOpt(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

async function safeQuery(filters: Parameters<typeof queryVideos>[0]) {
  try {
    return await queryVideos(filters);
  } catch {
    return { rows: [], scoreThreshold: null, nextCursor: null };
  }
}
