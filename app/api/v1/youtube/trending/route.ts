import { NextRequest, NextResponse } from 'next/server';
import { fetchTrending, fetchTrendingShorts, type TrendingRegion, type TrendingVideo } from '@/lib/youtube/trending';

export const dynamic = 'force-dynamic';

const REGIONS: TrendingRegion[] = ['KR', 'US', 'JP', 'GB', 'DE', 'FR', 'IN', 'BR'];

export async function GET(req: NextRequest) {
  const country = (req.nextUrl.searchParams.get('country') ?? req.nextUrl.searchParams.get('region') ?? 'KR').toUpperCase() as TrendingRegion;
  const type = (req.nextUrl.searchParams.get('type') ?? 'all').toLowerCase();
  const pages = Math.min(4, Math.max(1, Number(req.nextUrl.searchParams.get('pages') ?? 2)));

  if (!REGIONS.includes(country)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REGION', message: `country must be one of ${REGIONS.join(', ')}` } },
      { status: 400 }
    );
  }

  try {
    let items: TrendingVideo[] = [];

    if (type === 'short') {
      items = await fetchTrendingShorts(country, 50);
    } else if (type === 'long') {
      const all = await fetchTrending(country, pages);
      items = all.filter((v) => !v.isShorts);
      items.forEach((v, i) => (v.rank = i + 1));
    } else {
      const [longFeed, shortsFeed] = await Promise.all([
        fetchTrending(country, pages),
        fetchTrendingShorts(country, 50).catch(() => [] as TrendingVideo[]),
      ]);
      const merged = [...longFeed.filter((v) => !v.isShorts), ...shortsFeed];
      merged.sort((a, b) => b.viewCount - a.viewCount);
      merged.forEach((v, i) => (v.rank = i + 1));
      items = merged;
    }

    return NextResponse.json({
      success: true,
      data: items,
      meta: { total: items.length, country, type, pages },
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
    return NextResponse.json(
      { success: false, error: { code: 'YT_ERROR', message: msg.slice(0, 300) } },
      { status: 500 }
    );
  }
}
