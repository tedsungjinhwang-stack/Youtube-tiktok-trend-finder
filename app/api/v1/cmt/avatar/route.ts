import { NextRequest, NextResponse } from 'next/server';
import { getCred } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

/**
 * DALL-E 3 으로 프로필 아바타 이미지 생성 → data URL 반환.
 * POST body: { prompt: string, style?: 'pixel' | 'cartoon' | 'minimal' | 'robot' | 'emoji' }
 * 응답: { success, data: { dataUrl: string } }
 */
export async function POST(req: NextRequest) {
  const apiKey = await getCred('OPENAI_API_KEY');
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_KEY', message: 'OPENAI_API_KEY 등록 필요' } },
      { status: 503 }
    );
  }

  let body: { prompt?: string; style?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'JSON body 필요' } },
      { status: 400 }
    );
  }

  const styleMap: Record<string, string> = {
    pixel: 'pixel art, 8-bit retro, simple shapes, vibrant colors',
    cartoon: 'cartoon avatar, clean line art, friendly, 2d illustration',
    minimal: 'minimalist flat avatar, soft pastel colors, geometric shapes',
    robot: 'cute robot character avatar, mechanical details, friendly',
    emoji: 'emoji-style face, exaggerated expression, simple round head',
  };
  const styleHint = styleMap[(body.style ?? '').toLowerCase()] ?? 'cute avatar portrait';
  const userPrompt = (body.prompt ?? '').trim() || 'a friendly person';

  const prompt = `Circular profile avatar of ${userPrompt}. ${styleHint}. Plain solid color background. Head and shoulders only, centered, high contrast.`;

  try {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        response_format: 'b64_json',
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { success: false, error: { code: 'OPENAI_ERROR', message: `${resp.status}: ${text.slice(0, 300)}` } },
        { status: resp.status >= 500 ? 502 : 400 }
      );
    }
    const j = (await resp.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_IMAGE', message: '이미지 생성 실패' } },
        { status: 502 }
      );
    }
    return NextResponse.json({
      success: true,
      data: { dataUrl: `data:image/png;base64,${b64}` },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NETWORK', message: (e as Error).message.slice(0, 200) } },
      { status: 502 }
    );
  }
}
