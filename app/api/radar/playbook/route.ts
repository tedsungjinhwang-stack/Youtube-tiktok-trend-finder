import { NextResponse } from 'next/server';
import { getPlaybook } from '@/lib/radar/playbook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 양산형 레이더 · 형식 신호 · 부활 후보 작품 — AI 없이 계산, 1시간 캐시 */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await getPlaybook()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
