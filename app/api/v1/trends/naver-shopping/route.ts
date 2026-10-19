import { NextResponse } from 'next/server';
import {
  SHOPPING_AGES,
  SHOPPING_CATEGORIES,
  SHOPPING_PERIODS,
  shoppingRanks,
  type Gender,
  type ShoppingPeriod,
} from '@/lib/trends/naver-shopping';
import { getVolumes, volumeKey } from '@/lib/trends/naver-searchad';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 네이버 쇼핑인사이트 연령대별 인기 검색어 + 월간 검색수.
 * ?cid=분야 &period=1d|7d|30d|90d &gender=|f|m &age=all(연령대 비교)|10|20…|total(전체 연령)
 * 비교 보기는 연령대마다 상위 10개, 한 연령대 보기는 상위 20개.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cid = SHOPPING_CATEGORIES.some((c) => c.id === sp.get('cid')) ? sp.get('cid')! : SHOPPING_CATEGORIES[0].id;
  const period = (sp.get('period') ?? '30d') in SHOPPING_PERIODS ? (sp.get('period') as ShoppingPeriod) : '30d';
  const gender = (['f', 'm'].includes(sp.get('gender') ?? '') ? sp.get('gender') : '') as Gender;
  const ageParam = sp.get('age') ?? 'all';
  const compare = ageParam === 'all';
  const ages = compare ? [...SHOPPING_AGES] : (SHOPPING_AGES as readonly string[]).includes(ageParam) ? [ageParam] : [];
  try {
    const { range, rows, fetchedAt } = await shoppingRanks({ cid, period, gender, ages, count: compare ? 10 : 20 });
    const { map, enabled } = await getVolumes(rows.flatMap((r) => r.keywords));
    return NextResponse.json({
      success: true,
      data: {
        cid,
        period,
        gender,
        range,
        fetchedAt,
        naverEnabled: enabled,
        rows: rows.map((r) => ({
          age: r.age,
          items: r.keywords.map((k, i) => ({ rank: i + 1, keyword: k, naver: map[volumeKey(k)] ?? null })),
        })),
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: { code: 'NAVER_FAILED', message: (e as Error).message } }, { status: 502 });
  }
}
