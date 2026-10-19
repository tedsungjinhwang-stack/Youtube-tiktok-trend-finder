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
/** '' 전체 · 'pc' · 'mo'(모바일) */
export type Device = '' | 'pc' | 'mo';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * 데이터랩 쇼핑인사이트 내부 호출 공통.
 * X-Requested-With·Referer 가 없으면 빈 응답이 오고, 한꺼번에 몰아도 빈 응답이 잦아서 재시도한다 (실측).
 */
async function post<T>(path: string, form: Record<string, string>, referer = 'sCategory'): Promise<T> {
  const body = new URLSearchParams(form);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://datalab.naver.com/shoppingInsight/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: `https://datalab.naver.com/shoppingInsight/${referer}.naver`,
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': UA,
      },
      body,
      cache: 'no-store',
    });
    const text = (await res.text()).trim();
    if (res.ok && text.startsWith('{')) return JSON.parse(text) as T;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  throw new Error('네이버 쇼핑인사이트 응답 없음');
}

/** 한 페이지 20개. 500위까지 = 25페이지 */
async function fetchRanks(
  cid: string,
  age: string,
  gender: Gender,
  device: Device,
  start: string,
  end: string,
  count: number
): Promise<string[]> {
  const pages = Math.ceil(count / 20);
  const out: string[] = [];
  for (let page = 1; page <= pages; page++) {
    const j = await post<{ ranks?: { keyword: string }[] }>('getCategoryKeywordRank.naver', {
      cid,
      timeUnit: 'date',
      startDate: start,
      endDate: end,
      age,
      gender,
      device,
      page: String(page),
      count: String(Math.min(20, count)),
    });
    const got = (j.ranks ?? []).map((r) => r.keyword);
    out.push(...got);
    if (got.length < 20) break; // 마지막 페이지
  }
  return out.slice(0, count);
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
  device: Device;
  count: number;
}): Promise<{ range: { start: string; end: string }; rows: AgeRanks[]; fetchedAt: string }> {
  const range = kstRangeEndingYesterday(SHOPPING_PERIODS[opts.period]);
  const ages = opts.ages.length ? opts.ages : [''];
  const key = `naver-shop:${opts.cid}:${range.start}:${range.end}:${opts.gender}:${opts.device}:${ages.join(',')}:${opts.count}`;
  const { data, fetchedAt } = await cached(key, 6 * 3600_000, async () =>
    mapLimit(ages, 2, async (age) => ({
      age,
      keywords: await fetchRanks(opts.cid, age, opts.gender, opts.device, range.start, range.end, opts.count),
    }))
  );
  return { range, rows: data, fetchedAt };
}

export type CategoryNode = { cid: string; name: string; level: number; leaf: boolean };
export type CategoryInfo = { cid: string; name: string; parents: { cid: string; name: string }[]; children: CategoryNode[] };

/** 하위 분야 (2·3·4단계). 분야 목록은 거의 안 바뀌어서 7일 캐시 */
export async function shoppingCategory(cid: string): Promise<CategoryInfo> {
  const { data } = await cached(`naver-shop-cat:${cid}`, 7 * 86_400_000, async () => {
    const res = await fetch(`https://datalab.naver.com/shoppingInsight/getCategory.naver?cid=${encodeURIComponent(cid)}`, {
      headers: {
        Referer: 'https://datalab.naver.com/shoppingInsight/sCategory.naver',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': UA,
      },
      cache: 'no-store',
    });
    const text = (await res.text()).trim();
    if (!res.ok || !text.startsWith('{')) throw new Error('네이버 분야 목록 응답 없음');
    type Raw = {
      cid: number;
      name: string;
      level: number;
      leaf: boolean;
      svcUse?: boolean;
      deleted?: boolean;
      parents?: { cid: number; name: string }[];
      childList?: Raw[];
    };
    const j = JSON.parse(text) as Raw;
    return {
      cid: String(j.cid),
      name: j.name,
      parents: (j.parents ?? []).filter((p) => p.cid !== 0).map((p) => ({ cid: String(p.cid), name: p.name })),
      children: (j.childList ?? [])
        .filter((c) => !c.deleted && c.svcUse !== false)
        .map((c) => ({ cid: String(c.cid), name: c.name, level: c.level, leaf: c.leaf })),
    };
  });
  return data;
}

export type KeywordInsight = {
  cid: string;
  range: { start: string; end: string };
  /** 연령대별 비율 (가장 많은 연령대 = 100) */
  ages: { code: string; label: string; ratio: number }[];
  gender: { code: string; label: string; ratio: number }[];
  device: { code: string; label: string; ratio: number }[];
  /** 일별 클릭 추이 (기간 내 최댓값 = 100) */
  trend: { date: string; value: number }[];
};

/**
 * 쇼핑 키워드 하나의 연령·성별·기기 비율과 클릭 추이 (그 분야 안에서의 쇼핑 클릭 기준).
 * 상품이 아닌 키워드(드라마·인물)는 거의 비어서 나온다.
 */
export async function shoppingKeywordInsight(cid: string, keyword: string, period: ShoppingPeriod): Promise<KeywordInsight> {
  const range = kstRangeEndingYesterday(SHOPPING_PERIODS[period]);
  const kw = keyword.trim();
  const { data } = await cached(`naver-shop-kw:${cid}:${kw}:${range.start}:${range.end}`, 6 * 3600_000, async () => {
    const form = { cid, timeUnit: 'date', startDate: range.start, endDate: range.end, keyword: kw, age: '', gender: '', device: '' };
    type Rate = { result?: { data?: { code: string; label: string; ratio: number }[] }[] };
    type Trend = { result?: { data?: { period: string; value: number }[] }[] };
    const [ages, gender, device] = await mapLimit(
      ['getKeywordAgeRate.naver', 'getKeywordGenderRate.naver', 'getKeywordDeviceRate.naver'],
      2,
      (path) => post<Rate>(path, form, 'sKeyword')
    );
    const trend = await post<Trend>('getKeywordClickTrend.naver', form, 'sKeyword');
    const rate = (r: Rate) => (r.result?.[0]?.data ?? []).map((d) => ({ code: d.code, label: d.label, ratio: d.ratio }));
    return {
      cid,
      range,
      ages: rate(ages),
      gender: rate(gender),
      device: rate(device),
      trend: (trend.result?.[0]?.data ?? []).map((d) => ({
        date: `${d.period.slice(0, 4)}-${d.period.slice(4, 6)}-${d.period.slice(6, 8)}`,
        value: d.value,
      })),
    };
  });
  return data;
}
