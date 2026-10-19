/**
 * 네이버 개발자센터 오픈 API (developers.naver.com) — 검색광고 API 와 다른 키.
 *
 * 1) 데이터랩 검색어 트렌드 (/v1/datalab/search) — 아무 키워드나 일별 검색 추이.
 *    연령·성별·기기 필터가 있지만 결과는 요청마다 '그 요청 안 최댓값 = 100' 으로 정규화돼서
 *    연령대끼리 크기를 비교할 수 없다. 그래서 연령대별로는 '최근 구간이 앞 구간보다 얼마나 올랐나'
 *    (상승률)만 계산한다 — 같은 줄 안의 비율이라 정규화와 무관하다.
 * 2) 검색 (/v1/search/{news,blog,cafearticle}) — 글 수(누적)와 최신 뉴스. 최신 100건의 날짜로
 *    최근 24시간·7일 기사 수를 센다 (화제성).
 *
 * 하루 호출 한도가 있어(데이터랩 1,000회) 결과를 12시간 캐시한다.
 */
import { cached, kstRangeEndingYesterday, mapLimit, readSecret } from './cache';

export class NoNaverDevKeyError extends Error {
  code = 'NO_NAVER_DEV_KEY' as const;
}

async function creds() {
  const [id, secret] = await Promise.all([readSecret('NAVER_DEV_CLIENT_ID'), readSecret('NAVER_DEV_CLIENT_SECRET')]);
  if (!id || !secret) throw new NoNaverDevKeyError('네이버 개발자센터 키(Client ID·Secret)가 필요합니다');
  return { id, secret };
}

/** 화면 연령대 → 데이터랩 연령 코드 (1: 0~12세, 2: 13~18, 3: 19~24 … 11: 60세 이상) */
const AGE_GROUPS: { label: string; codes: string[] }[] = [
  { label: '10대', codes: ['1', '2'] },
  { label: '20대', codes: ['3', '4'] },
  { label: '30대', codes: ['5', '6'] },
  { label: '40대', codes: ['7', '8'] },
  { label: '50대', codes: ['9', '10'] },
  { label: '60대+', codes: ['11'] },
];

export const TREND_PERIODS = { '7d': 7, '1m': 30, '3m': 90, '12m': 365 } as const;
export type TrendPeriod = keyof typeof TREND_PERIODS;

type Point = { date: string; value: number };
export type Segment = { label: string; series: Point[]; /** 최근 1/4 평균 ÷ 앞 3/4 평균 − 1 (%). 앞이 0 이면 null */ growth: number | null };

export type SearchTrend = {
  range: { start: string; end: string };
  timeUnit: 'date' | 'week';
  total: Point[];
  ages: Segment[];
  gender: Segment[];
  device: Segment[];
};

function growthOf(series: Point[]): number | null {
  if (series.length < 4) return null;
  const cut = Math.floor(series.length * 0.75);
  const avg = (xs: Point[]) => xs.reduce((a, b) => a + b.value, 0) / Math.max(xs.length, 1);
  const before = avg(series.slice(0, cut));
  const after = avg(series.slice(cut));
  if (before <= 0) return after > 0 ? null : 0;
  return Math.round((after / before - 1) * 100);
}

async function datalab(
  c: { id: string; secret: string },
  body: { startDate: string; endDate: string; timeUnit: string; keyword: string; ages?: string[]; gender?: string; device?: string }
): Promise<Point[]> {
  const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: { 'X-Naver-Client-Id': c.id, 'X-Naver-Client-Secret': c.secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: body.startDate,
      endDate: body.endDate,
      timeUnit: body.timeUnit,
      keywordGroups: [{ groupName: body.keyword, keywords: [body.keyword] }],
      ...(body.ages ? { ages: body.ages } : {}),
      ...(body.gender ? { gender: body.gender } : {}),
      ...(body.device ? { device: body.device } : {}),
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`네이버 데이터랩 HTTP ${res.status}${res.status === 401 ? ' (키 확인)' : ''}`);
  const j = (await res.json()) as { results?: { data?: { period: string; ratio: number }[] }[] };
  return (j.results?.[0]?.data ?? []).map((d) => ({ date: d.period, value: d.ratio }));
}

/** 키워드 하나의 검색 추이 + 연령대·성별·기기별 상승세. 호출 11번(전체 1 + 연령 6 + 성별 2 + 기기 2) */
export async function naverSearchTrend(keyword: string, period: TrendPeriod) {
  const kw = keyword.trim();
  const range = kstRangeEndingYesterday(TREND_PERIODS[period]);
  // 1년은 일별이면 점이 너무 많아 주별로
  const timeUnit = period === '12m' ? 'week' : 'date';
  return cached(`naver-datalab:${kw}:${range.start}:${range.end}`, 12 * 3600_000, async (): Promise<SearchTrend> => {
    const c = await creds();
    const base = { startDate: range.start, endDate: range.end, timeUnit, keyword: kw };
    const total = await datalab(c, base);
    const segs = await mapLimit(
      [
        ...AGE_GROUPS.map((g) => ({ kind: 'age', label: g.label, extra: { ages: g.codes } })),
        { kind: 'gender', label: '여성', extra: { gender: 'f' } },
        { kind: 'gender', label: '남성', extra: { gender: 'm' } },
        { kind: 'device', label: 'PC', extra: { device: 'pc' } },
        { kind: 'device', label: '모바일', extra: { device: 'mo' } },
      ],
      3,
      async (s) => {
        const series = await datalab(c, { ...base, ...s.extra });
        return { kind: s.kind, seg: { label: s.label, series, growth: growthOf(series) } };
      }
    );
    const pick = (k: string) => segs.filter((s) => s.kind === k).map((s) => s.seg);
    return { range, timeUnit, total, ages: pick('age'), gender: pick('gender'), device: pick('device') };
  });
}

export type Buzz = {
  news: { total: number; last24h: number; last7d: number; sampled: number; latest: { title: string; link: string; pubDate: string }[] };
  blog: { total: number };
  cafe: { total: number };
};

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}

/** 화제성 — 뉴스·블로그·카페 글 수와 최근 기사. 1시간 캐시 */
export async function naverBuzz(keyword: string) {
  const kw = keyword.trim();
  return cached(`naver-buzz:${kw}`, 3600_000, async (): Promise<Buzz> => {
    const c = await creds();
    const get = async (kind: string, display: number, sort: 'date' | 'sim') => {
      const qs = new URLSearchParams({ query: kw, display: String(display), sort });
      const res = await fetch(`https://openapi.naver.com/v1/search/${kind}.json?${qs}`, {
        headers: { 'X-Naver-Client-Id': c.id, 'X-Naver-Client-Secret': c.secret },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`네이버 검색 HTTP ${res.status}${res.status === 401 ? ' (키 확인)' : ''}`);
      return (await res.json()) as { total: number; items: { title: string; link: string; originallink?: string; pubDate?: string }[] };
    };
    const [news, blog, cafe] = await Promise.all([get('news', 100, 'date'), get('blog', 1, 'sim'), get('cafearticle', 1, 'sim')]);
    const now = Date.now();
    const ages = news.items.map((i) => (i.pubDate ? now - new Date(i.pubDate).getTime() : Infinity));
    return {
      news: {
        total: news.total,
        // 최신 100건 안에서 센 값 — 100건이 다 24시간 안이면 실제로는 그보다 많다
        last24h: ages.filter((a) => a <= 86_400_000).length,
        last7d: ages.filter((a) => a <= 7 * 86_400_000).length,
        sampled: news.items.length,
        latest: news.items.slice(0, 6).map((i) => ({ title: stripTags(i.title), link: i.originallink || i.link, pubDate: i.pubDate ?? '' })),
      },
      blog: { total: blog.total },
      cafe: { total: cafe.total },
    };
  });
}
