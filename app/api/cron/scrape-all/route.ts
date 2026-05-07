import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/auth';
import { scrapeAllActive } from '@/lib/scraper';
import { getAutoScrapeEnabled } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron: 0 18 * * * (UTC 18:00 = KST 03:00) — 자동 수집 ON일 때 모든 활성 채널 스크래핑.
 */
export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'CRON_SECRET required' } },
      { status: 401 }
    );
  }

  const enabled = await getAutoScrapeEnabled();
  if (!enabled) {
    return NextResponse.json({
      success: true,
      data: { skipped: true, reason: '자동 수집 OFF — /settings에서 켤 수 있음' },
    });
  }

  try {
    const result = await scrapeAllActive();
    return NextResponse.json({
      success: true,
      data: { dispatchedAt: new Date().toISOString(), ...result },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'SCRAPE_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
