import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 무료 Google Translate(gtx) 프록시.
 * 브라우저에서 직접 호출하면 CORS 로 막혀서 서버 경유. 키/DB 없음, 온디맨드.
 *
 * POST { q: string[] | string, sl?: string, tl?: string }
 *   sl 미지정/'auto' → 자동감지. tl 기본 'ko'.
 * → { translations: string[] }  (입력 순서 유지)
 */
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED' } },
      { status: 401 }
    );
  }

  let body: { q?: string[] | string; sl?: string; tl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ translations: [] });
  }

  const list = Array.isArray(body.q) ? body.q : body.q ? [body.q] : [];
  const sl = body.sl || 'auto';
  const tl = body.tl || 'ko';
  if (list.length === 0) return NextResponse.json({ translations: [] });

  const out: string[] = new Array(list.length).fill('');
  // gtx 레이트리밋 회피용 5개씩 순차 배치
  const CHUNK = 5;
  for (let i = 0; i < list.length; i += CHUNK) {
    const slice = list.slice(i, i + CHUNK);
    const done = await Promise.all(
      slice.map((t) => translateOne(t, sl, tl).catch(() => t))
    );
    done.forEach((v, j) => (out[i + j] = v));
  }

  return NextResponse.json({ translations: out });
}

async function translateOne(text: string, sl: string, tl: string): Promise<string> {
  if (!text.trim()) return text;
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as [Array<[string]>];
  // data[0] = [[번역조각, 원문조각, ...], ...]
  return data[0].map((seg) => seg[0]).join('');
}
