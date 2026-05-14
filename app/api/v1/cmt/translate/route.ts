import { NextRequest, NextResponse } from 'next/server';
import { openaiFetch } from '@/lib/openai/oauth';

export const dynamic = 'force-dynamic';

/**
 * 초월번역 (creative translation) — 단순 번역이 아니라 해당 언어 문화권 톤에 맞춰 자연스럽게.
 * POST body: { texts: string[], targetLanguage: string ('한국어' | 'English' | '日本語' | '中文') }
 * 응답: { success, data: string[] }  (입력 순서 동일)
 */
export async function POST(req: NextRequest) {
  let body: { texts?: string[]; targetLanguage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'JSON body 필요' } },
      { status: 400 }
    );
  }

  const texts = (body.texts ?? []).filter((t) => typeof t === 'string').slice(0, 50);
  if (texts.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'EMPTY', message: 'texts 배열 비어있음' } },
      { status: 400 }
    );
  }
  const targetLanguage = (body.targetLanguage ?? '한국어').trim();

  const sys = `너는 YouTube 댓글 번역가다. 입력 댓글을 ${targetLanguage} 로 "초월번역" 한다.
- 직역 X, 해당 언어권의 자연스러운 표현·어순·드립으로
- 이모지·강조·말투 유지
- 길이 비슷하게`;

  const user = `JSON 배열로 응답. 입력 순서 동일 유지.
입력: ${JSON.stringify(texts)}

응답 형식: { "translations": ["...", "..."] }`;

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
        temperature: 0.7,
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
    let parsed: { translations?: string[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'PARSE_ERROR', message: '응답 파싱 실패' } },
        { status: 502 }
      );
    }
    const translations = (parsed.translations ?? []).slice(0, texts.length);
    while (translations.length < texts.length) translations.push(texts[translations.length]);
    return NextResponse.json({ success: true, data: translations });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NETWORK', message: (e as Error).message.slice(0, 200) } },
      { status: 502 }
    );
  }
}
