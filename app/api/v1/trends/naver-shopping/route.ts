import { NextResponse } from 'next/server';
import {
  SHOPPING_AGES,
  SHOPPING_CATEGORIES,
  SHOPPING_PERIODS,
  shoppingRanks,
  type Device,
  type Gender,
  type ShoppingPeriod,
} from '@/lib/trends/naver-shopping';
import { getVolumes, volumeKey } from '@/lib/trends/naver-searchad';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 네이버 쇼핑인사이트 연령대별 인기 검색어 + 월간 검색수.
 * ?cid=분야(하위 분야 포함) &period=1d|7d|30d|90d &gender=|f|m &device=|pc|mo
 *  &age=all(연령대 비교)|total(전체 연령)|10|20…  &count=20|100|500 (한 연령대 보기)
 * 비교 보기는 연령대마다 상위 10개. 검색수는 상위 100개까지만 붙인다 (500개 전부는 네이버 호출이 너무 많다).
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  // 하위 분야도 받으므로 숫자 형식만 확인
  const cid = /^\d{8}$/.test(sp.get('cid') ?? '') ? sp.get('cid')! : SHOPPING_CATEGORIES[0].id;
  const period = (sp.get('period') ?? '30d') in SHOPPING_PERIODS ? (sp.get('period') as ShoppingPeriod) : '30d';
  const gender = (['f', 'm'].includes(sp.get('gender') ?? '') ? sp.get('gender') : '') as Gender;
  const device = (['pc', 'mo'].includes(sp.get('device') ?? '') ? sp.get('device') : '') as Device;
  const ageParam = sp.get('age') ?? 'all';
  const compare = ageParam === 'all';
  const ages = compare ? [...SHOPPING_AGES] : (SHOPPING_AGES as readonly string[]).includes(ageParam) ? [ageParam] : [];
  try {
    const count = compare ? 10 : [20, 100, 500].includes(Number(sp.get('count'))) ? Number(sp.get('count')) : 20;
    const { range, rows, fetchedAt } = await shoppingRanks({ cid, period, gender, device, ages, count });
    const { map, enabled } = await getVolumes(rows.flatMap((r) => r.keywords.slice(0, 100)));
    return NextResponse.json({
      success: true,
      data: {
        cid,
        period,
        gender,
        device,
        count,
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
