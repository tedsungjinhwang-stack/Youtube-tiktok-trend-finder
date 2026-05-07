import { cookies } from 'next/headers';
import { CategoryTabs } from '@/components/category-tabs';
import { PageFilters } from '@/components/page-filters';
import { SelectableVideoGrid } from '@/components/selectable-video-grid';
import { queryVideos } from '@/lib/queries/videos';
import { prisma } from '@/lib/db';
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
  isShorts?: 'true' | 'false';
};

export default async function YoutubePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const folders = await safeFolders();
  const c = cookies();
  const defaults = {
    minViews: numFromCookie(
      c.get(COOKIE_KEY_MIN_VIEWS)?.value,
      BUILTIN_DEFAULTS.minViews
    ),
  };

  const result = await safeQuery({
    folderId: searchParams.folderId,
    platform: 'YOUTUBE',
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
  });

  return (
    <>
      <CategoryTabs folders={folders} />

      <div className="px-4 py-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold tracking-tight">YouTube</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            에셋 채널 YT 영상 · 폴더·기간·임계치 필터링
          </p>
        </div>

        <div className="mb-4">
          <PageFilters platforms={['YOUTUBE']} showPlatformToggle={false} defaults={defaults} />
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
        YouTube 채널을 추가하고 스크래핑하면 여기에 표시됩니다 —
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

async function safeFolders() {
  try {
    const folders = await prisma.folder.findMany({
      where: { NOT: { name: { startsWith: '__' } } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, _count: { select: { channels: true } } },
    });
    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      channelCount: f._count.channels,
    }));
  } catch {
    return [];
  }
}

async function safeQuery(filters: Parameters<typeof queryVideos>[0]) {
  try {
    return await queryVideos(filters);
  } catch {
    return { rows: [], scoreThreshold: null, nextCursor: null };
  }
}
