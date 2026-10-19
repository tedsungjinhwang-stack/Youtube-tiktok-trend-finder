import { NextResponse } from 'next/server';
import { googleTrending } from '@/lib/trends/google';
import { getVolumes, volumeKey } from '@/lib/trends/naver-searchad';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 구글 급상승 (최근 24시간·7일) + 네이버 월간 검색수.
 * ?hours=24|168 &cat=분야번호(없으면 전체) &limit=50
 * 7일은 1,000건이 넘어서 검색수는 분야로 거른 상위 limit 개에만 붙인다 (네이버 호출 수 절약).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const hours = sp.get('hours') === '168' ? 168 : 24;
  const cat = sp.get('cat') ? Number(sp.get('cat')) : null;
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 50, 1), 100);
  try {
    const { data, fetchedAt } = await googleTrending(hours);
    const counts: Record<number, number> = {};
    for (const it of data) for (const c of it.categories) counts[c] = (counts[c] ?? 0) + 1;
    const filtered = cat === null ? data : data.filter((it) => it.categories.includes(cat));
    const top = filtered.slice(0, limit);
    const { map, enabled } = await getVolumes(top.map((t) => t.query));
    return NextResponse.json({
      success: true,
      data: {
        hours,
        total: data.length,
        matched: filtered.length,
        counts,
        fetchedAt,
        naverEnabled: enabled,
        items: top.map((t) => ({ ...t, naver: map[volumeKey(t.query)] ?? null })),
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: { code: 'GOOGLE_FAILED', message: (e as Error).message } }, { status: 502 });
  }
}
