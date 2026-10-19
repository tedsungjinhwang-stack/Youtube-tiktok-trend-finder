import { NextResponse } from 'next/server';
import { getRelated, getVolumes, volumeKey } from '@/lib/trends/naver-searchad';
import { naverBuzz, naverSearchTrend, NoNaverDevKeyError, TREND_PERIODS, type TrendPeriod } from '@/lib/trends/naver-open';
import { shoppingKeywordInsight, type ShoppingPeriod } from '@/lib/trends/naver-shopping';
import { googleKeyword, NoProxyError } from '@/lib/trends/google';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 키워드 하나 깊게 보기. 출처마다 따로 성공/실패하게 묶어서 보낸다
 * (키가 없는 출처가 있어도 나머지는 보여야 한다).
 * ?q=닥터X &period=7d|1m|3m|12m &cid=쇼핑분야(선택 — 쇼핑 키워드일 때)
 */
type Part<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function part<T>(fn: () => Promise<T>): Promise<Part<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const own = (e as { code?: unknown }).code;
    const code = e instanceof NoNaverDevKeyError || e instanceof NoProxyError ? e.code : typeof own === 'string' ? own : 'FAILED';
    return { ok: false, code, message: (e as Error).message };
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim().slice(0, 60);
  if (!q) return NextResponse.json({ success: false, error: { code: 'NO_QUERY', message: '키워드를 넣어 주세요' } }, { status: 400 });
  const period = ((sp.get('period') ?? '1m') in TREND_PERIODS ? sp.get('period') : '1m') as TrendPeriod;
  const cid = /^\d{8}$/.test(sp.get('cid') ?? '') ? sp.get('cid')! : '';
  // 쇼핑인사이트는 7·30·90일만 있다 → 1년은 90일로
  const shopPeriod: ShoppingPeriod = period === '7d' ? '7d' : period === '1m' ? '30d' : '90d';

  const [volume, related, trend, buzz, shopping, google] = await Promise.all([
    part(async () => {
      const { map, enabled } = await getVolumes([q]);
      if (!enabled) throw Object.assign(new Error('네이버 검색광고 키가 없습니다'), { code: 'NO_SEARCHAD_KEY' });
      return map[volumeKey(q)] ?? null;
    }),
    part(async () => (await getRelated(q, 40)).items),
    part(async () => (await naverSearchTrend(q, period)).data),
    part(async () => (await naverBuzz(q)).data),
    cid ? part(() => shoppingKeywordInsight(cid, q, shopPeriod)) : Promise.resolve(null),
    part(async () => (await googleKeyword(q, period)).data),
  ]);
  return NextResponse.json({ success: true, data: { q, period, cid, volume, related, trend, buzz, shopping, google } });
}
