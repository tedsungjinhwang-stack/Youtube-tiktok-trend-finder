import { NextRequest, NextResponse } from 'next/server';
import { openaiFetch } from '@/lib/openai/oauth';

export const dynamic = 'force-dynamic';

/**
 * 인스타형 슬라이드 N장 AI 자동 생성. OpenAI Chat Completions (JSON mode).
 * POST body: { topic: string, count?: number (1-12), language?: string, style?: string }
 * 응답: { success, data: Array<{ title, body }> }
 */
export async function POST(req: NextRequest) {
  let body: { topic?: string; count?: number; language?: string; style?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'JSON body 필요' } },
      { status: 400 }
    );
  }

  const topic = (body.topic ?? '').trim();
  if (!topic) {
    return NextResponse.json(
      { success: false, error: { code: 'EMPTY_TOPIC', message: 'topic 입력 필요' } },
      { status: 400 }
    );
  }
  const count = Math.min(12, Math.max(1, Number(body.count ?? 5)));
  const language = (body.language ?? '한국어').trim();
  const style = (body.style ?? '훅·정보·결론 구조의 숏폼 카루셀').trim();

  const sys = `너는 숏폼 콘텐츠 작가다. 인스타 카루셀/릴스용 텍스트 슬라이드 ${count}장을 ${language} 로 만든다.
스타일: ${style}
각 슬라이드는:
- title: 큰 헤드라인 (5~14자, 강한 훅)
- body: 본문 2~4줄 (한 줄 너무 길지 않게 줄바꿈)
- 1장은 강한 훅, 마지막 장은 행동 유도(CTA) 또는 정리`;

  const user = `주제: ${topic}
${count}장 슬라이드.

응답 JSON 형식: { "slides": [{ "title": "...", "body": "..." }] }`;

  try {
    const resp = await openaiFetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.85,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { success: false, error: { code: 'OPENAI_ERROR', message: `${resp.status}: ${text.slice(0, 300)}` } },
        { status: resp.status >= 500 ? 502 : 400 }
      );
    }
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = j.choices?.[0]?.message?.content ?? '{}';
    let parsed: { slides?: Array<{ title?: string; body?: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'PARSE_ERROR', message: 'OpenAI 응답 JSON 파싱 실패' } },
        { status: 502 }
      );
    }
    const items = (parsed.slides ?? []).slice(0, count).map((row) => ({
      title: String(row.title ?? '').slice(0, 80),
      body: String(row.body ?? '').slice(0, 600),
    }));
    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NETWORK', message: (e as Error).message.slice(0, 200) } },
      { status: 502 }
    );
  }
}
