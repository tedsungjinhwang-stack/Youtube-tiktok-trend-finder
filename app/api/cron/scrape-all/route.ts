import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron: 0 18 * * * (UTC 18:00 = KST 03:00) — daily scrape of all active channels.
 */
export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'CRON_SECRET required' } },
      { status: 401 }
    );
  }
  // Phase 2: enumerate active channels and dispatch lib/scraper/index.ts.
  return NextResponse.json({
    success: true,
    data: { dispatchedAt: new Date().toISOString(), channelsQueued: 0 },
  });
}
