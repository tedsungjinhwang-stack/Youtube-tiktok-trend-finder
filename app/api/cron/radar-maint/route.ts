import { NextResponse } from 'next/server';
import { readSecret } from '@/lib/trends/cache';
import { runRadarMaintenance } from '@/lib/radar/collect';

export const dynamic = 'force-dynamic';
// 하루 한 번 정비 · 별칭 배우기는 수십 초 걸린다 — 60초 수집기와 따로
export const maxDuration = 300;

/**
 * 꿀통레이더 정비 — Supabase pg_cron 이 2시간마다(매 짝수 시 30분) 부른다. 할 때가 아닌 일은 바로 건너뛴다.
 * 인증은 /api/cron/radar 와 같다 (`Authorization: Bearer <RADAR_CRON_SECRET 또는 CRON_SECRET>`).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('secret') || '';
  const keys = [await readSecret('RADAR_CRON_SECRET'), process.env.CRON_SECRET?.trim() || null].filter((k): k is string => !!k);
  if (!keys.length || !keys.includes(given)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, data: await runRadarMaintenance() });
  } catch (e) {
    return NextResponse.json({ success: false, error: { code: 'MAINT_FAILED', message: (e as Error).message.slice(0, 300) } }, { status: 500 });
  }
}
