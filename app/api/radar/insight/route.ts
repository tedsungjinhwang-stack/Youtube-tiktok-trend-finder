import { NextResponse } from 'next/server';
import { hasClaudeKey, NoClaudeKeyError } from '@/lib/radar/claude';
import { cleanParams, generateInsight, lastInsight, parseInsightQuery, scopeOf } from '@/lib/radar/insight';
import { jobState, startJob } from '@/lib/radar/jobs';

export const dynamic = 'force-dynamic';
// Claude 분석이 30초~2분 — 백그라운드(waitUntil)로 이어서 돈다
export const maxDuration = 300;

const jobName = (q: NonNullable<ReturnType<typeof parseInsightQuery>>) => `insight:${q.kind}:${scopeOf(q.kind, cleanParams(q.kind, q.params)).scope}`;

/** 탭·범위의 마지막 AI 분석 · 지금 분석 중인가 (?kind=rising&period=3d …) */
export async function GET(req: Request) {
  const q = parseInsightQuery(new URL(req.url).searchParams);
  if (!q) return NextResponse.json({ ok: false, error: 'kind 가 없습니다' }, { status: 400 });
  const [last, job] = await Promise.all([lastInsight(q.kind, q.params), jobState(jobName(q))]);
  return NextResponse.json({ ok: true, ...last, job });
}

/** 새로 분석 시작 (호출마다 Claude 비용) — 바로 돌려주고, 화면이 GET 으로 끝났는지 묻는다 */
export async function POST(req: Request) {
  const q = parseInsightQuery(new URL(req.url).searchParams);
  if (!q) return NextResponse.json({ ok: false, error: 'kind 가 없습니다' }, { status: 400 });
  if (!(await hasClaudeKey())) return NextResponse.json({ ok: false, error: new NoClaudeKeyError().message }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await startJob(jobName(q), () => generateInsight(q.kind, q.params))) });
}
