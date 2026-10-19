import { NextResponse } from 'next/server';
import { GOOGLE_PROPERTIES, googlePeriod, NoProxyError, type GoogleProperty } from '@/lib/trends/google';
import { getVolumes, volumeKey } from '@/lib/trends/naver-searchad';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 구글 1달·3달 인기/급상승 검색어 (프록시 필요). ?period=1m|3m &cat=0 &q=주제어(선택) &prop=|youtube|froogle|news */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const period = sp.get('period') === '3m' ? '3m' : '1m';
  const cat = Number(sp.get('cat') ?? 0) || 0;
  const q = (sp.get('q') ?? '').slice(0, 60);
  const prop = ((GOOGLE_PROPERTIES as readonly string[]).includes(sp.get('prop') ?? '') ? sp.get('prop') ?? '' : '') as GoogleProperty;
  try {
    const { data, fetchedAt } = await googlePeriod(period, cat, q, prop);
    const { map, enabled } = await getVolumes([...data.top, ...data.rising].map((r) => r.query));
    const add = (rows: typeof data.top) => rows.map((r) => ({ ...r, naver: map[volumeKey(r.query)] ?? null }));
    return NextResponse.json({
      success: true,
      data: { period, cat, q, prop, fetchedAt, naverEnabled: enabled, top: add(data.top), rising: add(data.rising) },
    });
  } catch (e) {
    if (e instanceof NoProxyError) {
      return NextResponse.json({ success: false, error: { code: 'NO_PROXY', message: e.message } }, { status: 412 });
    }
    return NextResponse.json({ success: false, error: { code: 'GOOGLE_FAILED', message: (e as Error).message } }, { status: 502 });
  }
}
