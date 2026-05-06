import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/auth';
import { resetAllQuotas } from '@/lib/youtube/keyManager';

export const dynamic = 'force-dynamic';

/**
 * Vercel Cron: 5 8 * * * (UTC 08:05 = PT 00:05 = KST 17:05)
 * Resets usedToday=0 and clears exhaustedAt/resetAt for all keys.
 */
export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'CRON_SECRET required' } },
      { status: 401 }
    );
  }
  try {
    const result = await resetAllQuotas();
    return NextResponse.json({ success: true, data: { resetCount: result.count } });
  } catch (e) {
    // No DB yet during scaffold — return success with 0.
    return NextResponse.json({ success: true, data: { resetCount: 0, note: 'DB not connected' } });
  }
}
