import { NextResponse } from 'next/server';
import { generateBrief, lastBrief } from '@/lib/radar/brief';
import { hasClaudeKey, NoClaudeKeyError } from '@/lib/radar/claude';
import { jobState, startJob } from '@/lib/radar/jobs';

export const dynamic = 'force-dynamic';
// Claude 분석이 1~4분 — 백그라운드(waitUntil)로 이어서 돈다
export const maxDuration = 300;

/** 마지막 브리핑 · 키가 있나 · 지금 분석 중인가 */
export async function GET() {
  const [last, job] = await Promise.all([lastBrief(), jobState('brief')]);
  return NextResponse.json({ ...last, job });
}

/** 새 브리핑 시작 (호출마다 Claude 비용) — 바로 돌려주고, 화면이 GET 으로 끝났는지 묻는다 */
export async function POST() {
  if (!(await hasClaudeKey())) return NextResponse.json({ ok: false, error: new NoClaudeKeyError().message }, { status: 400 });
  const r = await startJob('brief', generateBrief);
  return NextResponse.json({ ok: true, ...r });
}
