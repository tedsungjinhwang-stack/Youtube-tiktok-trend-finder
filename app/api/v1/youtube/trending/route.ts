import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchTrending, type TrendingRegion, type TrendingVideo } from '@/lib/youtube/trending';

export const dynamic = 'force-dynamic';

const REGIONS: TrendingRegion[] = ['KR', 'US', 'JP', 'GB', 'DE', 'FR', 'IN', 'BR'];

/** KR 만 캐시 사용. 다른 region 은 realtime fallback. */
const CACHED_REGIONS = new Set(['KR']);
/** 캐시 윈도우 점진 확장 (결과 적으면 자동으로 더 긴 기간 조회) */
const WINDOW_STEPS_HOURS = [72, 168, 336, 720]; // 3일 → 7일 → 14일 → 30일
/** 이 개수 미만이면 다음 윈도우로 확장 + realtime 으로 보충 */
const MIN_TARGET = 100;

export async function GET(req: NextRequest) {
  const country = (req.nextUrl.searchParams.get('country') ?? req.nextUrl.searchParams.get('region') ?? 'KR').toUpperCase() as TrendingRegion;
  const type = (req.nextUrl.searchParams.get('type') ?? 'all').toLowerCase();
  const pages = Math.min(4, Math.max(1, Number(req.nextUrl.searchParams.get('pages') ?? 4)));

  if (!REGIONS.includes(country)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REGION', message: `country must be one of ${REGIONS.join(', ')}` } },
      { status: 400 }
    );
  }

  // 1. 캐시 우선 조회 (KR 만). 100개 미만이면 realtime 으로 보충.
  if (CACHED_REGIONS.has(country)) {
    try {
      const cached = await fetchFromCache(country, type);
      if (cached.length >= MIN_TARGET) {
        return NextResponse.json({
          success: true,
          data: cached,
          meta: { total: cached.length, country, type, source: 'cache' },
        });
      }
      if (cached.length > 0) {
        try {
          const live = await fetchTrending(country, pages);
          const filtered = filterByType(live, type);
          const merged = mergeUnique(cached, filtered);
          return NextResponse.json({
            success: true,
            data: merged,
            meta: {
              total: merged.length,
              country,
              type,
              source: 'cache+realtime',
              cacheCount: cached.length,
              liveCount: filtered.length,
            },
          });
        } catch {
          return NextResponse.json({
            success: true,
            data: cached,
            meta: { total: cached.length, country, type, source: 'cache' },
          });
        }
      }
    } catch {
      /* table 미마이그레이션 등 → realtime fallback */
    }
  }

  // 2. Realtime fallback
  try {
    const all = await fetchTrending(country, pages);
    let items: TrendingVideo[];
    if (type === 'short') items = all.filter((v) => v.isShorts);
    else if (type === 'long') items = all.filter((v) => !v.isShorts);
    else items = all;
    items.forEach((v, i) => (v.rank = i + 1));

    return NextResponse.json({
      success: true,
      data: items,
      meta: { total: items.length, country, type, source: 'realtime' },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'quota_exhausted') {
      return NextResponse.json(
        { success: false, error: { code: 'QUOTA_EXHAUSTED', message: '모든 키 quota 소진' } },
        { status: 429 }
      );
    }
    if (/API 키 없음/.test(msg)) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_KEY', message: msg } },
        { status: 503 }
      );
    }
    if (/만료|무효|expired|invalid/i.test(msg)) {
      return NextResponse.json(
        { success: false, error: { code: 'KEY_EXPIRED', message: msg } },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'YT_ERROR', message: msg.slice(0, 300) } },
      { status: 500 }
    );
  }
}

function filterByType(items: TrendingVideo[], type: string): TrendingVideo[] {
  if (type === 'short') return items.filter((v) => v.isShorts);
  if (type === 'long') return items.filter((v) => !v.isShorts);
  return items;
}

function mergeUnique(cached: TrendingVideo[], live: TrendingVideo[]): TrendingVideo[] {
  const seen = new Set(cached.map((v) => v.videoId));
  const merged = [...cached];
  for (const v of live) {
    if (seen.has(v.videoId)) continue;
    seen.add(v.videoId);
    merged.push(v);
  }
  merged.sort((a, b) => b.viewCount - a.viewCount);
  merged.forEach((v, i) => (v.rank = i + 1));
  return merged;
}

async function queryCacheRows(region: string, type: string, hours: number) {
  const cutoff = new Date(Date.now() - hours * 3600_000);
  const where: { region: string; capturedAt: { gte: Date }; isShorts?: boolean } = {
    region,
    capturedAt: { gte: cutoff },
  };
  if (type === 'short') where.isShorts = true;
  else if (type === 'long') where.isShorts = false;

  const rows = await prisma.trendingSnapshot.findMany({
    where,
    orderBy: [{ capturedAt: 'desc' }, { viewCount: 'desc' }],
    take: 5000,
  });

  const seen = new Set<string>();
  const dedupe: typeof rows = [];
  for (const r of rows) {
    if (seen.has(r.videoId)) continue;
    seen.add(r.videoId);
    dedupe.push(r);
  }
  dedupe.sort((a, b) => Number(b.viewCount) - Number(a.viewCount));
  return dedupe;
}

async function fetchFromCache(
  region: string,
  type: string
): Promise<TrendingVideo[]> {
  // 결과 100개 못 채우면 윈도우 점진 확장 (3일 → 7일 → 14일 → 30일)
  let dedupe: Awaited<ReturnType<typeof queryCacheRows>> = [];
  for (const hours of WINDOW_STEPS_HOURS) {
    dedupe = await queryCacheRows(region, type, hours);
    if (dedupe.length >= MIN_TARGET) break;
  }

  return dedupe.map((r, i) => ({
    rank: i + 1,
    videoId: r.videoId,
    url: r.isShorts
      ? `https://www.youtube.com/shorts/${r.videoId}`
      : `https://www.youtube.com/watch?v=${r.videoId}`,
    title: r.title,
    thumbnailUrl: r.thumbnailUrl ?? `https://img.youtube.com/vi/${r.videoId}/maxresdefault.jpg`,
    channelId: r.channelId,
    channelName: r.channelName,
    publishedAt: r.publishedAt.toISOString(),
    viewCount: Number(r.viewCount),
    likeCount: r.likeCount != null ? Number(r.likeCount) : null,
    commentCount: r.commentCount != null ? Number(r.commentCount) : null,
    durationSeconds: r.durationSeconds,
    isShorts: r.isShorts,
    region: region as TrendingRegion,
  }));
}
