import { NextResponse } from 'next/server';
import { hasClaudeKey, NoClaudeKeyError } from '@/lib/radar/claude';
import { generatePackPlan, lastPackPlan } from '@/lib/radar/packPlan';

export const dynamic = 'force-dynamic';
// Claude 가 팩 수십 개의 검색어를 만드는 데 1~2분
export const maxDuration = 300;

/** 마지막 팩별 검색어 계획 */
export async function GET() {
  const [plan, hasKey] = await Promise.all([lastPackPlan(), hasClaudeKey()]);
  return NextResponse.json({ plan, hasKey });
}

/** 새로 만들기 (호출마다 Claude 비용) */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, plan: await generatePackPlan() });
  } catch (e) {
    const status = e instanceof NoClaudeKeyError ? 400 : 500;
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status });
  }
}
