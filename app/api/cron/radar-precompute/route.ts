import { NextResponse } from 'next/server';
import { readSecret } from '@/lib/trends/cache';
import { runPrecompute } from '@/lib/radar/precompute';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * 무거운 집계 미리 계산 (플레이북 · 기회판 · 종합 분석 자료 · 황금키워드) — Supabase pg_cron 이 6시간마다(1·7·13·19시 10분 UTC) 부른다.
 * ?only=hot 은 터진 영상 목록만 — 매시간 9분(수집 0·3·6분이 끝난 뒤).
 * 인증은 /api/cron/radar 와 같다 (`Authorization: Bearer <RADAR_CRON_SECRET 또는 CRON_SECRET>`).
 */
export async function GET(req: Request) {
  const t0 = Date.now();
  const url = new URL(req.url);
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('secret') || '';
  const keys = [await readSecret('RADAR_CRON_SECRET'), process.env.CRON_SECRET?.trim() || null].filter((k): k is string => !!k);
  if (!keys.length || !keys.includes(given)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  try {
    const o = url.searchParams.get('only');
    const only = o === 'hot' || o === 'sources' ? o : undefined;
    return NextResponse.json({ success: true, data: await runPrecompute({ deadline: t0 + 290_000, only }) });
  } catch (e) {
    return NextResponse.json({ success: false, error: { code: 'PRECOMPUTE_FAILED', message: (e as Error).message.slice(0, 300) } }, { status: 500 });
  }
}
