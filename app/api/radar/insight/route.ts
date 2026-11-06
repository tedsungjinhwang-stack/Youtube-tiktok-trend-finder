import { NextResponse } from 'next/server';
import { NoClaudeKeyError } from '@/lib/radar/claude';
import { generateInsight, lastInsight, parseInsightQuery } from '@/lib/radar/insight';

export const dynamic = 'force-dynamic';
// Claude 분석이 30초~2분
export const maxDuration = 300;

/** 탭·범위의 마지막 AI 분석 (?kind=rising&period=3d …) */
export async function GET(req: Request) {
  const q = parseInsightQuery(new URL(req.url).searchParams);
  if (!q) return NextResponse.json({ ok: false, error: 'kind 가 없습니다' }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await lastInsight(q.kind, q.params)) });
}

/** 새로 분석 (호출마다 Claude 비용) */
export async function POST(req: Request) {
  const q = parseInsightQuery(new URL(req.url).searchParams);
  if (!q) return NextResponse.json({ ok: false, error: 'kind 가 없습니다' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, insight: await generateInsight(q.kind, q.params) });
  } catch (e) {
    const status = e instanceof NoClaudeKeyError ? 400 : 500;
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status });
  }
}
