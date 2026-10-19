import { NextResponse } from 'next/server';
import { googlePeriod, NoProxyError } from '@/lib/trends/google';
import { getVolumes, volumeKey } from '@/lib/trends/naver-searchad';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 구글 1달·3달 인기/급상승 검색어 (프록시 필요). ?period=1m|3m &cat=0 &q=주제어(선택) */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const period = sp.get('period') === '3m' ? '3m' : '1m';
  const cat = Number(sp.get('cat') ?? 0) || 0;
  const q = (sp.get('q') ?? '').slice(0, 60);
  try {
    const { data, fetchedAt } = await googlePeriod(period, cat, q);
    const { map, enabled } = await getVolumes([...data.top, ...data.rising].map((r) => r.query));
    const add = (rows: typeof data.top) => rows.map((r) => ({ ...r, naver: map[volumeKey(r.query)] ?? null }));
    return NextResponse.json({
      success: true,
      data: { period, cat, q, fetchedAt, naverEnabled: enabled, top: add(data.top), rising: add(data.rising) },
    });
  } catch (e) {
    if (e instanceof NoProxyError) {
      return NextResponse.json({ success: false, error: { code: 'NO_PROXY', message: e.message } }, { status: 412 });
    }
    return NextResponse.json({ success: false, error: { code: 'GOOGLE_FAILED', message: (e as Error).message } }, { status: 502 });
  }
}
