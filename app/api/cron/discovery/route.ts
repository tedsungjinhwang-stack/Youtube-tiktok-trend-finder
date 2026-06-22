import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/auth';
import { getCredSync } from '@/lib/credentials';
import { collectAndSave } from '@/lib/discovery/save';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 디스커버리 수집 cron.
 *
 * Vercel Hobby 는 일 1회 cron 만 허용 → 외부 cron(cron-job.org)으로 매시간 호출.
 *   GET https://<도메인>/api/cron/discovery
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   (헤더 못 넣는 경우 ?secret=<CRON_SECRET> 쿼리도 허용)
 */
export async function GET(req: NextRequest) {
  const qSecret = req.nextUrl.searchParams.get('secret');
  const expected = getCredSync('CRON_SECRET');
  const ok = checkCronAuth(req) || (!!expected && qSecret === expected);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'CRON_SECRET required' } },
      { status: 401 }
    );
  }

  try {
    const result = await collectAndSave();
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    return NextResponse.json(
      { success: false, error: { code: 'DISCOVERY_FAILED', message: msg } },
      { status: 500 }
    );
  }
}
