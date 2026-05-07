import { cookies } from 'next/headers';
import { CategoryTabs } from '@/components/category-tabs';
import { PageFilters } from '@/components/page-filters';
import { VideoCard } from '@/components/video-card';
import { queryVideos } from '@/lib/queries/videos';
import { prisma } from '@/lib/db';
import {
  BUILTIN_DEFAULTS,
  COOKIE_KEY_MIN_VIEWS,
  numFromCookie,
} from '@/lib/settings';
import type { Platform } from '@prisma/client';

export const dynamic = 'force-dynamic';

type SearchParams = {
  folderId?: string;
  platforms?: string;
  period?: '24h' | '48h' | '7d' | '30d' | 'all';
  sortBy?: 'viralScore' | 'views' | 'publishedAt';
  minScore?: string;
  minViews?: string;
  minAgeDays?: string;
};

const ALLOWED: Platform[] = ['TIKTOK', 'INSTAGRAM'];

export default async function SocialPage({
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
  const platforms = parsePlatforms(searchParams.platforms) ?? ALLOWED;

  const result = await safeQuery({
    folderId: searchParams.folderId,
    platforms,
    period: searchParams.period,
    minAgeDays: numOpt(searchParams.minAgeDays),
    sortBy: searchParams.sortBy,
    minViews: numOpt(searchParams.minViews) ?? defaults.minViews,
  });

  return (
    <>
      <CategoryTabs folders={folders} />

      <div className="px-4 py-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold tracking-tight">TikTok / Instagram</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            등록된 TT / IG 에셋 채널의 영상
          </p>
        </div>

        <div className="mb-4">
          <PageFilters platforms={ALLOWED} defaults={defaults} />
        </div>

        {result.rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {result.rows.map((v, i) => (
              <VideoCard
                key={v.id}
                data={{
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
                }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">표시할 영상이 없습니다</p>
      <p className="mt-1 text-xs">
        TikTok / Instagram 채널을 추가하고 Apify로 스크래핑하면 표시됩니다 —
        <a href="/channels" className="ml-1 underline hover:text-foreground">
          채널 추가하러 가기
        </a>
      </p>
    </div>
  );
}

function parsePlatforms(raw?: string): Platform[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .filter((p): p is Platform => ALLOWED.includes(p as Platform));
  return list.length > 0 ? list : undefined;
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
