import { NextResponse } from 'next/server';
import { readSecret } from '@/lib/trends/cache';
import { runRadarCollect } from '@/lib/radar/collect';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 꿀통레이더 수집 — Supabase pg_cron 이 매시 정각·3분·6분에 부른다 (lib/radar/collect 참고).
 *
 * 인증: `Authorization: Bearer <키>` 또는 `?secret=<키>`.
 * 키는 RADAR_CRON_SECRET (Credential 테이블, pg_cron 이 같은 값을 읽어 보낸다) 또는 CRON_SECRET.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('secret') || '';
  const keys = [await readSecret('RADAR_CRON_SECRET'), process.env.CRON_SECRET?.trim() || null].filter(
    (k): k is string => !!k
  );
  if (!keys.length || !keys.includes(given)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  try {
    const report = await runRadarCollect({ budgetMs: 45_000 });
    return NextResponse.json({ success: true, data: report });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'COLLECT_FAILED', message: (e as Error).message.slice(0, 300) } },
      { status: 500 }
    );
  }
}
