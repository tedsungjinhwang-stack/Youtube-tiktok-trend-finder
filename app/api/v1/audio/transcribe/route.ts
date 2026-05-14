import { NextRequest, NextResponse } from 'next/server';
import { openaiFetch } from '@/lib/openai/oauth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Whisper can be slow

/**
 * 오디오 파일 → OpenAI Whisper 로 전사 + 단어 단위 타임스탬프.
 * multipart/form-data 로 받음 (file=audio)
 * 응답: { success, data: { text, segments: Array<{ start, end, text }> } }
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_FILE', message: 'file 필드에 오디오 파일 필요' } },
      { status: 400 }
    );
  }

  const upstream = new FormData();
  upstream.append('file', file);
  upstream.append('model', 'whisper-1');
  upstream.append('response_format', 'verbose_json');
  upstream.append('timestamp_granularities[]', 'segment');

  try {
    const resp = await openaiFetch(
      '/v1/audio/transcriptions',
      { method: 'POST', body: upstream },
      { forceApiKey: true }
    );
    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { success: false, error: { code: 'OPENAI_ERROR', message: `${resp.status}: ${text.slice(0, 300)}` } },
        { status: resp.status >= 500 ? 502 : 400 }
      );
    }
    const j = (await resp.json()) as {
      text?: string;
      segments?: Array<{ start: number; end: number; text: string }>;
    };
    return NextResponse.json({
      success: true,
      data: {
        text: j.text ?? '',
        segments: (j.segments ?? []).map((s) => ({
          start: s.start,
          end: s.end,
          text: (s.text ?? '').trim(),
        })),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NETWORK', message: (e as Error).message.slice(0, 200) } },
      { status: 502 }
    );
  }
}
