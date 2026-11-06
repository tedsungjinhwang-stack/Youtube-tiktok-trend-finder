import { NextResponse } from 'next/server';
import { readSecret } from '@/lib/trends/cache';
import { generatePackPlan } from '@/lib/radar/packPlan';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 팩별 검색어 계획 — Supabase pg_cron 이 주 1회(월요일 새벽 4:17 KST) 부른다. 인증은 /api/cron/radar 와 같다
 * (`Authorization: Bearer <RADAR_CRON_SECRET 또는 CRON_SECRET>`).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('secret') || '';
  const keys = [await readSecret('RADAR_CRON_SECRET'), process.env.CRON_SECRET?.trim() || null].filter((k): k is string => !!k);
  if (!keys.length || !keys.includes(given)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  try {
    const plan = await generatePackPlan();
    return NextResponse.json({
      success: true,
      data: { packs: plan.packs.length, newCategories: plan.newCategories.map((c) => c.name), costKrw: plan.costKrw },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: { code: 'PLAN_FAILED', message: (e as Error).message.slice(0, 300) } }, { status: 500 });
  }
}
