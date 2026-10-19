/**
 * 네이버 데이터랩 쇼핑인사이트 — 분야별 인기 검색어 순위 (연령·성별·기간 필터).
 *
 * 연령대별로 '지금 뭐가 뜨는지'를 알려주는 유일한 공개 데이터다. 다만 공식 API 가 아니라
 * 데이터랩 웹 화면이 내부적으로 부르는 주소라 네이버가 바꾸면 깨질 수 있다.
 * 쇼핑 분야 한정이고, 데이터는 어제까지 (당일 없음). 순위만 주고 검색수는 안 준다.
 */
import { cached, kstRangeEndingYesterday, mapLimit } from './cache';

export const SHOPPING_CATEGORIES = [
  { id: '50000000', label: '패션의류' },
  { id: '50000001', label: '패션잡화' },
  { id: '50000002', label: '화장품/미용' },
  { id: '50000003', label: '디지털/가전' },
  { id: '50000004', label: '가구/인테리어' },
  { id: '50000005', label: '출산/육아' },
  { id: '50000006', label: '식품' },
  { id: '50000007', label: '스포츠/레저' },
  { id: '50000008', label: '생활/건강' },
  { id: '50000009', label: '여가/생활편의' },
  { id: '50005542', label: '도서' },
] as const;

export const SHOPPING_AGES = ['10', '20', '30', '40', '50', '60'] as const;
export type ShoppingAge = (typeof SHOPPING_AGES)[number];

/** 화면의 기간 → 어제로 끝나는 일수 */
export const SHOPPING_PERIODS = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 } as const;
export type ShoppingPeriod = keyof typeof SHOPPING_PERIODS;

export type Gender = '' | 'f' | 'm';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchRanks(cid: string, age: string, gender: Gender, start: string, end: string, count: number): Promise<string[]> {
  const body = new URLSearchParams({
    cid,
    timeUnit: 'date',
    startDate: start,
    endDate: end,
    age,
    gender,
    device: '',
    page: '1',
    count: String(count),
  });
  // X-Requested-With·Referer 가 없으면 빈 응답이 온다 (실측)
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: 'https://datalab.naver.com/shoppingInsight/sCategory.naver',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': UA,
      },
      body,
      cache: 'no-store',
    });
    const text = (await res.text()).trim();
    if (res.ok && text.startsWith('{')) {
      const j = JSON.parse(text) as { ranks?: { keyword: string }[] };
      return (j.ranks ?? []).map((r) => r.keyword);
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error('네이버 쇼핑인사이트 응답 없음');
}

export type AgeRanks = { age: string; keywords: string[] };

/**
 * 한 분야를 연령대별로. ages 를 비우면 '전체 연령' 한 줄.
 * 6시간 캐시 — 데이터가 하루 단위로만 바뀐다.
 */
export async function shoppingRanks(opts: {
  cid: string;
  period: ShoppingPeriod;
  ages: string[];
  gender: Gender;
  count: number;
}): Promise<{ range: { start: string; end: string }; rows: AgeRanks[]; fetchedAt: string }> {
  const range = kstRangeEndingYesterday(SHOPPING_PERIODS[opts.period]);
  const ages = opts.ages.length ? opts.ages : [''];
  const key = `naver-shop:${opts.cid}:${range.start}:${range.end}:${opts.gender}:${ages.join(',')}:${opts.count}`;
  const { data, fetchedAt } = await cached(key, 6 * 3600_000, async () =>
    // 한꺼번에 몰면 빈 응답이 잦아서 2개씩
    mapLimit(ages, 2, async (age) => ({
      age,
      keywords: await fetchRanks(opts.cid, age, opts.gender, range.start, range.end, opts.count),
    }))
  );
  return { range, rows: data, fetchedAt };
}
