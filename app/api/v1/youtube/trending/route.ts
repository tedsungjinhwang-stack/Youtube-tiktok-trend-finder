import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchTrending, type TrendingRegion, type TrendingVideo } from '@/lib/youtube/trending';

export const dynamic = 'force-dynamic';

const REGIONS: TrendingRegion[] = ['KR', 'US', 'JP', 'GB', 'DE', 'FR', 'IN', 'BR'];

/** KR 만 캐시 사용. 다른 region 은 realtime fallback. */
const CACHED_REGIONS = new Set(['KR']);
/** 캐시에서 최근 N시간 데이터 누적 (쇼츠 100+개 보장 목적) */
const CACHE_WINDOW_HOURS = 72;

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

  // 1. 캐시 우선 조회 (KR 만)
  if (CACHED_REGIONS.has(country)) {
    try {
      const cached = await fetchFromCache(country, type);
      if (cached.length > 0) {
        return NextResponse.json({
          success: true,
          data: cached,
          meta: { total: cached.length, country, type, source: 'cache' },
        });
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

async function fetchFromCache(
  region: string,
  type: string
): Promise<TrendingVideo[]> {
  const cutoff = new Date(Date.now() - CACHE_WINDOW_HOURS * 3600_000);

  const where: { region: string; capturedAt: { gte: Date }; isShorts?: boolean } = {
    region,
    capturedAt: { gte: cutoff },
  };
  if (type === 'short') where.isShorts = true;
  else if (type === 'long') where.isShorts = false;

  // 같은 videoId 가 시간마다 반복 저장됨 → 가장 최근 capturedAt 기준 dedupe.
  // Postgres DISTINCT ON 흉내내기: 전부 가져온 뒤 JS 에서 dedupe (영상 수 작아서 OK).
  const rows = await prisma.trendingSnapshot.findMany({
    where,
    orderBy: [{ capturedAt: 'desc' }, { viewCount: 'desc' }],
    take: 1000, // 안전 상한
  });

  const seen = new Set<string>();
  const dedupe: typeof rows = [];
  for (const r of rows) {
    if (seen.has(r.videoId)) continue;
    seen.add(r.videoId);
    dedupe.push(r);
  }

  // viewCount 내림차순으로 최종 정렬
  dedupe.sort((a, b) => Number(b.viewCount) - Number(a.viewCount));

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
