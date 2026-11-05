import { NextResponse } from 'next/server';
import { generateBrief, lastBrief, NoClaudeKeyError } from '@/lib/radar/brief';

export const dynamic = 'force-dynamic';
// Claude 분석이 1~3분 걸린다
export const maxDuration = 300;

/** 마지막 브리핑 */
export async function GET() {
  return NextResponse.json(await lastBrief());
}

/** 새 브리핑 만들기 (호출마다 Claude 비용) */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, brief: await generateBrief() });
  } catch (e) {
    const status = e instanceof NoClaudeKeyError ? 400 : 500;
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status });
  }
}
