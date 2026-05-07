import { NextRequest, NextResponse } from 'next/server';
import { fetchTrending, type TrendingRegion } from '@/lib/youtube/trending';

export const dynamic = 'force-dynamic';

const REGIONS: TrendingRegion[] = ['KR', 'US', 'JP', 'GB', 'DE', 'FR', 'IN', 'BR'];

export async function GET(req: NextRequest) {
  const region = (req.nextUrl.searchParams.get('region') ?? 'KR').toUpperCase() as TrendingRegion;
  const pages = Math.min(4, Math.max(1, Number(req.nextUrl.searchParams.get('pages') ?? 1)));

  if (!REGIONS.includes(region)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REGION', message: `region must be one of ${REGIONS.join(', ')}` } },
      { status: 400 }
    );
  }

  try {
    const items = await fetchTrending(region, pages);
    return NextResponse.json({
      success: true,
      data: items,
      meta: { total: items.length, region, pages },
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
