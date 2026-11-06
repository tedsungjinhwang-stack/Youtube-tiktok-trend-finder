import { NextResponse } from 'next/server';
import { hasClaudeKey, NoClaudeKeyError } from '@/lib/radar/claude';
import { jobState, startJob } from '@/lib/radar/jobs';
import { generatePackPlan, lastPackPlan } from '@/lib/radar/packPlan';

export const dynamic = 'force-dynamic';
// Claude 가 팩 수십 개의 검색어를 만드는 데 1~2분 — 백그라운드로
export const maxDuration = 300;

/** 마지막 팩별 검색어 계획 · 지금 만드는 중인가 */
export async function GET() {
  const [plan, hasKey, job] = await Promise.all([lastPackPlan(), hasClaudeKey(), jobState('pack-plan')]);
  return NextResponse.json({ plan, hasKey, job });
}

/** 새로 만들기 시작 (호출마다 Claude 비용) */
export async function POST() {
  if (!(await hasClaudeKey())) return NextResponse.json({ ok: false, error: new NoClaudeKeyError().message }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await startJob('pack-plan', generatePackPlan)) });
}
