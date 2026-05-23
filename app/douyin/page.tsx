import { cookies } from 'next/headers';
import { CategoryTabs } from '@/components/category-tabs';
import { PageFilters } from '@/components/page-filters';
import { SelectableVideoGrid } from '@/components/selectable-video-grid';
import { ScrapeButton } from '@/components/scrape-button';
import { queryVideos } from '@/lib/queries/videos';
import { getFoldersWithChannelCount } from '@/lib/queries/folders';
import {
  BUILTIN_DEFAULTS,
  COOKIE_KEY_MIN_VIEWS,
  numFromCookie,
} from '@/lib/settings';

export const dynamic = 'force-dynamic';

type SearchParams = {
  folderId?: string;
  period?: '24h' | '48h' | '7d' | '30d' | 'all';
  sortBy?: 'viralScore' | 'views' | 'publishedAt';
  minScore?: string;
  minViews?: string;
  minAgeDays?: string;
};

export default async function DouyinPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const folders = await getFoldersWithChannelCount(['DOUYIN']);
  const c = cookies();
  const defaults = {
    minViews: numFromCookie(
      c.get(COOKIE_KEY_MIN_VIEWS)?.value,
      BUILTIN_DEFAULTS.minViews
    ),
  };

  const result = await safeQuery({
    folderId: searchParams.folderId,
    platform: 'DOUYIN',
    period: searchParams.period,
    minAgeDays: numOpt(searchParams.minAgeDays),
    sortBy: searchParams.sortBy,
    minViews: numOpt(searchParams.minViews) ?? defaults.minViews,
  });

  return (
    <>
      <CategoryTabs folders={folders} />

      <div className="px-4 py-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">도우인</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              등록된 도우인 채널 영상 · 폴더·기간·임계치 필터링
            </p>
          </div>
          <ScrapeButton platforms={['DOUYIN']} label="도우인 채널 조회" />
        </div>

        <div className="mb-4">
          <PageFilters platforms={['DOUYIN']} showPlatformToggle={false} defaults={defaults} />
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

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">표시할 영상이 없습니다</p>
      <p className="mt-1 text-xs">
        도우인 채널을 추가하고 스크래핑하면 여기에 표시됩니다 —
        <a href="/channels" className="ml-1 underline hover:text-foreground">
          채널 추가하러 가기
        </a>
      </p>
    </div>
  );
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
