/**
 * 구글 트렌드 (한국).
 *
 * 1) 급상승 검색어 — 최근 24시간·7일. 구글 트렌드 'Trending now' 화면이 쓰는 내부 호출(i0OFE).
 *    서버에서 바로 열리고, 대략적인 검색량(10만+ 등)과 분야 번호를 준다. 7일이 최대.
 * 2) 기간 조회 — 1달·3달 인기/급상승 검색어 (explore → relatedsearches).
 *    서버·클라우드 IP 는 구글이 429 로 막아서 GOOGLE_TRENDS_PROXY 를 거쳐야 한다.
 *
 * 구글은 연령대 정보를 주지 않는다.
 */
import { fetch as ufetch, ProxyAgent, type Dispatcher } from 'undici';
import { socksDispatcher } from 'fetch-socks';
import { cached, readSecret, scrubSecrets } from './cache';

export { TRENDING_CATEGORIES, EXPLORE_CATEGORIES } from './categories';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';


export type TrendingItem = {
  query: string;
  /** 구글이 주는 대략적인 검색량 (하한값, 예: 100000 = 10만+) */
  volume: number;
  /** 상승률 % (1000 = +1,000%) */
  growth: number | null;
  /** 급상승 시작 시각 ISO */
  startedAt: string | null;
  /** 아직 진행 중인지 (끝난 시각이 없으면 진행 중) */
  active: boolean;
  categories: number[];
  /** 같이 검색된 말 */
  related: string[];
};

function parseTrending(raw: string): TrendingItem[] {
  // 응답은 길이 줄 + JSON 줄이 번갈아 온다. wrb.fr 줄의 세 번째 칸이 다시 JSON 문자열이다.
  const line = raw.split('\n').find((l) => l.startsWith('[["wrb.fr"'));
  if (!line) throw new Error('구글 급상승 응답 형식이 바뀌었습니다');
  const inner = JSON.parse(JSON.parse(line)[0][2]) as unknown[];
  const items = (inner[1] ?? []) as unknown[][];
  // 같은 검색어가 여러 번 나올 수 있다 (예: '날씨' 두 건) → 검색량 큰 쪽으로 합친다
  const byQuery = new Map<string, TrendingItem>();
  for (const it of items) {
    const query = String(it[0] ?? '').trim();
    if (!query) continue;
    const start = Array.isArray(it[3]) && typeof it[3][0] === 'number' ? (it[3][0] as number) : null;
    const end = Array.isArray(it[4]) && typeof it[4][0] === 'number' ? (it[4][0] as number) : null;
    const item: TrendingItem = {
      query,
      volume: typeof it[6] === 'number' ? (it[6] as number) : 0,
      growth: typeof it[8] === 'number' ? (it[8] as number) : null,
      startedAt: start ? new Date(start * 1000).toISOString() : null,
      active: end === null,
      categories: Array.isArray(it[10]) ? (it[10] as number[]) : [],
      related: Array.isArray(it[9]) ? (it[9] as string[]).filter((r) => r !== query).slice(0, 6) : [],
    };
    const k = query.replace(/\s+/g, '').toLowerCase();
    const prev = byQuery.get(k);
    if (!prev) byQuery.set(k, item);
    else {
      const keep = prev.volume >= item.volume ? prev : item;
      keep.categories = [...new Set([...prev.categories, ...item.categories])];
      keep.related = [...new Set([...prev.related, ...item.related])].slice(0, 6);
      byQuery.set(k, keep);
    }
  }
  return [...byQuery.values()].sort((a, b) => b.volume - a.volume);
}

async function fetchTrending(hours: number): Promise<TrendingItem[]> {
  const freq = JSON.stringify([[['i0OFE', JSON.stringify([null, null, 'KR', 0, 'ko', hours, 1]), null, 'generic']]]);
  const res = await fetch('https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=i0OFE&hl=ko&rt=c', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
    body: new URLSearchParams({ 'f.req': freq }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`구글 급상승 HTTP ${res.status}`);
  return parseTrending(await res.text());
}

/** 최근 24시간(24) 또는 7일(168). 30분 캐시. */
export async function googleTrending(hours: 24 | 168) {
  return cached(`google-trending:KR:${hours}`, 30 * 60_000, () => fetchTrending(hours));
}

// ─────────────────────────── 기간 조회 (프록시 필요) ───────────────────────────


export type RelatedQuery = {
  query: string;
  /** 인기: 0~100 (1위=100). 급상승: 증가율 % (급등은 큰 값) */
  value: number;
  /** 구글 표기 그대로 ('100', '+250%', '급등') */
  label: string;
};

export class NoProxyError extends Error {
  code = 'NO_PROXY' as const;
}

function dispatcherFor(proxy: string): Dispatcher {
  const u = new URL(proxy);
  if (u.protocol.startsWith('socks')) {
    return socksDispatcher({
      type: u.protocol.startsWith('socks4') ? 4 : 5,
      host: u.hostname,
      port: Number(u.port || 1080),
      userId: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    });
  }
  return new ProxyAgent(proxy);
}

async function fetchPeriod(time: string, category: number, keyword: string): Promise<{ top: RelatedQuery[]; rising: RelatedQuery[] }> {
  const proxy = await readSecret('GOOGLE_TRENDS_PROXY');
  if (!proxy) throw new NoProxyError('구글 1달·3달 조회는 프록시가 필요합니다');
  const dispatcher = dispatcherFor(proxy);
  let cookie = '';
  const get = async (url: string) => {
    const res = await ufetch(url, {
      dispatcher,
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...(cookie ? { Cookie: cookie } : {}) },
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, text: await res.text() };
  };
  try {
    // 쿠키(NID)를 먼저 받아야 explore 가 덜 막힌다
    await get('https://trends.google.com/?geo=KR');
    const item: Record<string, string> = { geo: 'KR', time };
    if (keyword) item.keyword = keyword;
    const req = { comparisonItem: [item], category, property: '' };
    const ex = await get(
      `https://trends.google.com/trends/api/explore?hl=ko&tz=-540&req=${encodeURIComponent(JSON.stringify(req))}`
    );
    if (ex.status !== 200) throw new Error(`구글 explore HTTP ${ex.status}${ex.status === 429 ? ' (프록시도 막힘)' : ''}`);
    const widgets = (JSON.parse(ex.text.slice(ex.text.indexOf('{'))) as { widgets: { id: string; token: string; request: unknown }[] }).widgets;
    const w = widgets.find((x) => x.id === 'RELATED_QUERIES');
    if (!w) return { top: [], rising: [] };
    const rs = await get(
      `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=ko&tz=-540&req=${encodeURIComponent(
        JSON.stringify(w.request)
      )}&token=${encodeURIComponent(w.token)}`
    );
    if (rs.status !== 200) throw new Error(`구글 relatedsearches HTTP ${rs.status}`);
    type Ranked = { query: string; value: number; formattedValue: string };
    const lists = (JSON.parse(rs.text.slice(rs.text.indexOf('{'))) as {
      default: { rankedList: { rankedKeyword: Ranked[] }[] };
    }).default.rankedList;
    const conv = (l?: { rankedKeyword: Ranked[] }) =>
      (l?.rankedKeyword ?? []).map((r) => ({ query: r.query, value: r.value, label: r.formattedValue }));
    return { top: conv(lists[0]), rising: conv(lists[1]) };
  } catch (e) {
    if (e instanceof NoProxyError) throw e;
    throw new Error(scrubSecrets((e as Error).message));
  }
}

/** 1달('1m') / 3달('3m'). 12시간 캐시 — 프록시를 아끼고 차단도 피한다. */
export async function googlePeriod(period: '1m' | '3m', category: number, keyword: string) {
  const time = period === '1m' ? 'today 1-m' : 'today 3-m';
  const kw = keyword.trim();
  return cached(`google-period:KR:${period}:${category}:${kw}`, 12 * 3600_000, () => fetchPeriod(time, category, kw));
}
