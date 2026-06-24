import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 무료 Google Translate(gtx) 프록시.
 * 브라우저에서 직접 호출 시 CORS 막혀서 서버 경유. 키/DB 없음, 온디맨드.
 *
 * POST { q: string[] | string, sl?: string, tl?: string }
 *   sl 미지정/'auto' → 자동감지. tl 기본 'ko'.
 * → { translations: string[], errors?: string[], stats?: {ok, fail} }
 *
 * 실패 시 그 자리에 원문 그대로 들어가고 errors 배열에 사유 기록.
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
    return NextResponse.json({ translations: [], errors: ['bad json'], stats: { ok: 0, fail: 0 } });
  }

  const list = Array.isArray(body.q) ? body.q : body.q ? [body.q] : [];
  const sl = body.sl || 'auto';
  const tl = body.tl || 'ko';
  if (list.length === 0) {
    return NextResponse.json({ translations: [], stats: { ok: 0, fail: 0 } });
  }

  const out: string[] = new Array(list.length).fill('');
  const errors: string[] = [];
  let ok = 0;
  let fail = 0;

  // gtx 레이트리밋 회피용 5개씩 순차 배치
  const CHUNK = 5;
  for (let i = 0; i < list.length; i += CHUNK) {
    const slice = list.slice(i, i + CHUNK);
    const done = await Promise.all(slice.map((t) => translateOne(t, sl, tl)));
    done.forEach((res, j) => {
      const idx = i + j;
      if ('translated' in res) {
        out[idx] = res.translated;
        ok += 1;
      } else {
        out[idx] = list[idx];
        fail += 1;
        if (errors.length < 5) errors.push(res.error);
      }
    });
  }

  return NextResponse.json({
    translations: out,
    stats: { ok, fail },
    ...(errors.length ? { errors } : {}),
  });
}

type TranslateOk = { translated: string };
type TranslateFail = { error: string };

async function translateOne(
  text: string,
  sl: string,
  tl: string
): Promise<TranslateOk | TranslateFail> {
  if (!text.trim()) return { translated: text };
  // 1차: gtx (Google Translate 비공개 엔드포인트). 무료, 키 X.
  const gtx = await tryGtx(text, sl, tl);
  if ('translated' in gtx) return gtx;

  // 2차 폴백: MyMemory (1일 5000자 무료, 키 X). 짧은 게시글 제목엔 충분.
  const my = await tryMyMemory(text, sl, tl);
  if ('translated' in my) return my;

  return { error: `gtx: ${gtx.error} | mymemory: ${my.error}` };
}

async function tryGtx(
  text: string,
  sl: string,
  tl: string
): Promise<TranslateOk | TranslateFail> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}` +
    `&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url, {
      headers: {
        // 실제 브라우저 UA — gtx 가 봇 차단을 강화할 때 회피
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray((data as unknown[])[0])) {
      return { error: 'bad shape' };
    }
    const segs = (data as Array<Array<Array<unknown>>>)[0];
    const translated = segs
      .map((s) => (typeof s?.[0] === 'string' ? (s[0] as string) : ''))
      .join('');
    if (!translated) return { error: 'empty' };
    return { translated };
  } catch (e) {
    return { error: ((e as Error).message || 'err').slice(0, 60) };
  }
}

async function tryMyMemory(
  text: string,
  sl: string,
  tl: string
): Promise<TranslateOk | TranslateFail> {
  // MyMemory: langpair=ja|ko 형태. sl='auto' 인 경우 임시로 'autodetect' 시도.
  const src = sl === 'auto' ? 'autodetect' : sl;
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
    `&langpair=${encodeURIComponent(src)}|${encodeURIComponent(tl)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      responseData?: { translatedText?: string };
      responseStatus?: number;
    };
    const t = data.responseData?.translatedText;
    if (!t) return { error: 'no text' };
    if (data.responseStatus && data.responseStatus !== 200) {
      return { error: `status ${data.responseStatus}` };
    }
    return { translated: t };
  } catch (e) {
    return { error: ((e as Error).message || 'err').slice(0, 60) };
  }
}
