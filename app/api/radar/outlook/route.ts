import { NextResponse } from 'next/server';
import { categoryOutlook } from '@/lib/radar/outlook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 카테고리(채널팩) 기회판 — AI 없이 계산, 1시간 캐시 */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, rows: await categoryOutlook() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
