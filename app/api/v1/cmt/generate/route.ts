import { NextRequest, NextResponse } from 'next/server';
import { getCred } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

/**
 * AI 댓글 N개 생성. OpenAI Chat Completions (JSON mode) 사용.
 * POST body: { topic?: string, count?: number (1-20), language?: string, tone?: string }
 * 응답: { success, data: Array<{ authorName, content, likes, timeAgo }> }
 */
export async function POST(req: NextRequest) {
  const apiKey = await getCred('OPENAI_API_KEY');
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_KEY', message: 'OPENAI_API_KEY 등록 필요 (/settings/api-keys)' } },
      { status: 503 }
    );
  }

  let body: { topic?: string; count?: number; language?: string; tone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'JSON body 필요' } },
      { status: 400 }
    );
  }

  const count = Math.min(20, Math.max(1, Number(body.count ?? 5)));
  const language = (body.language ?? '한국어').trim();
  const topic = (body.topic ?? '').trim();
  const tone = (body.tone ?? '자연스럽고 다양함').trim();

  const sys = `너는 YouTube 댓글 작성자다. 진짜 사람이 쓴 것 같은 댓글을 ${language} 로 생성한다.
각 댓글마다 작성자 닉네임(닉네임은 한국어/영어/숫자 조합으로 자연스럽게), 본문(이모지 약간), 좋아요 카운트(1.2천 / 542 같은 한국식), 작성 시점("3시간 전","어제","2일 전" 등)을 만든다.
톤은 다양해야 한다: 칭찬·비판·궁금증·드립·짧은 반응 등 섞어서.`;

  const user = `주제/맥락: ${topic || '(일반 영상)'}
요구: ${count}개 댓글
톤: ${tone}

응답 JSON 형식:
{
  "comments": [
    { "authorName": "...", "content": "...", "likes": "1.2천", "timeAgo": "3시간 전" }
  ]
}`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.9,
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
    let parsed: { comments?: Array<{ authorName?: string; content?: string; likes?: string; timeAgo?: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'PARSE_ERROR', message: 'OpenAI 응답 JSON 파싱 실패' } },
        { status: 502 }
      );
    }
    const items = (parsed.comments ?? []).slice(0, count).map((row) => ({
      authorName: String(row.authorName ?? '익명').slice(0, 40),
      content: String(row.content ?? '').slice(0, 500),
      likes: String(row.likes ?? '0'),
      timeAgo: String(row.timeAgo ?? '방금'),
    }));
    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NETWORK', message: (e as Error).message.slice(0, 200) } },
      { status: 502 }
    );
  }
}
