import { NextResponse } from 'next/server';
import { categoryOutlook } from '@/lib/radar/outlook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 카테고리(채널팩) 기회판 — AI 없이 계산, 1시간 캐시. */
export async function GET(req: Request) {
  // ?foreign=1 이면 외국어 채널까지 넣어 계산 (기본은 한국어 채널만)
  const foreign = new URL(req.url).searchParams.get('foreign') === '1';
  try {
    return NextResponse.json({ ok: true, foreign, rows: await categoryOutlook({ foreign }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
