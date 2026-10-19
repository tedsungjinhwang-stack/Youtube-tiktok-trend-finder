'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarList,
  Card,
  GrowthBars,
  NeedKey,
  Pill,
  TrendLine,
  nf,
  naverSearchUrl,
  short,
  type Naver,
} from '../ui';
import { ProxyNotice } from './period';
import { SHOP_CATS } from './shopping';

/**
 * 키워드 하나 깊게 보기 — 출처마다 칸을 나누고, 키가 없는 칸은 안내만 보여 준다.
 *  - 네이버 검색광고: 월간 검색수·클릭·클릭률·경쟁·광고 수, 연관 키워드
 *  - 네이버 데이터랩(개발자 키): 검색 추이, 연령대·성별·기기별 상승세
 *  - 네이버 검색(개발자 키): 뉴스·블로그·카페 글 수, 최근 기사
 *  - 네이버 쇼핑인사이트(분야를 고르면): 쇼핑 클릭 기준 연령·성별·기기 비율과 추이
 *  - 구글(프록시): 관심도 추이, 시·도별, 관련 주제·검색어
 */

const PERIODS = [
  { key: '7d', label: '1주' },
  { key: '1m', label: '1달' },
  { key: '3m', label: '3달' },
  { key: '12m', label: '1년' },
];

type Part<T> = { ok: true; data: T } | { ok: false; code: string; message: string };
type Segment = { label: string; series: { date: string; value: number }[]; growth: number | null };
type Related = { keyword: string } & NonNullable<Naver>;
type Rq = { query: string; value: number; label: string };

type Result = {
  q: string;
  period: string;
  cid: string;
  volume: Part<Naver>;
  related: Part<Related[]>;
  trend: Part<{ range: { start: string; end: string }; timeUnit: string; total: { date: string; value: number }[]; ages: Segment[]; gender: Segment[]; device: Segment[] }>;
  buzz: Part<{
    news: { total: number; last24h: number; last7d: number; sampled: number; latest: { title: string; link: string; pubDate: string }[] };
    blog: { total: number };
    cafe: { total: number };
  }>;
  shopping: Part<{
    range: { start: string; end: string };
    ages: { label: string; ratio: number }[];
    gender: { label: string; ratio: number }[];
    device: { label: string; ratio: number }[];
    trend: { date: string; value: number }[];
  }> | null;
  google: Part<{ timeline: { date: string; value: number }[]; regions: { name: string; value: number }[]; topics: { top: Rq[]; rising: Rq[] }; queries: { top: Rq[]; rising: Rq[] } }>;
};

const DEV_KEY_HOW = (
  <>
    developers.naver.com → 애플리케이션 등록(데이터랩 검색어트렌드·검색 선택) → Client ID·Secret 을{' '}
    <Link href="/settings/api-keys" className="font-bold text-brand hover:underline">
      설정 → API 키
    </Link>
    에 넣으면 켜집니다.
  </>
);

/** 비율(최댓값=100)을 합계 대비 % 로 — '40대 100, 50대 55'보다 '40대 31%'가 읽기 쉽다 */
function shares(rows: { label: string; ratio: number }[]) {
  const sum = rows.reduce((a, b) => a + b.ratio, 0) || 1;
  return rows.map((r) => ({ label: r.label, value: r.ratio, note: `${Math.round((r.ratio / sum) * 100)}%` }));
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--subtle)' }}>
      <div className="text-[12px] font-bold text-muted-foreground">{label}</div>
      <div className="num mt-1 text-[22px] font-extrabold leading-none tracking-[-0.03em]">{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] font-semibold text-[color:var(--text-faint)]">{sub}</div>}
    </div>
  );
}

function failed(p: { ok: false; code: string; message: string }) {
  return <p className="text-[13px] text-[color:var(--text-faint)]">불러오지 못했습니다 — {p.message}</p>;
}

export function KeywordSection({
  initial,
  initialCid,
  onAnalyze,
}: {
  initial: string;
  initialCid?: string;
  onAnalyze: (q: string, cid?: string) => void;
}) {
  const [input, setInput] = useState(initial);
  const [q, setQ] = useState(initial);
  const [period, setPeriod] = useState('1m');
  const [cid, setCid] = useState(initialCid ?? '');
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 다른 칸에서 '분석'을 누르면 바뀐다
  useEffect(() => {
    setInput(initial);
    setQ(initial);
    if (initialCid !== undefined) setCid(initialCid);
  }, [initial, initialCid]);

  useEffect(() => {
    if (!q) return;
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ q, period, ...(cid ? { cid } : {}) });
    fetch(`/api/v1/trends/keyword?${qs}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.success ? setData(j.data) : setErr(j.error?.message ?? '불러오기 실패')))
      .catch((e) => e.name !== 'AbortError' && setErr((e as Error).message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [q, period, cid]);

  const v = data?.volume.ok ? data.volume.data : null;

  return (
    <>
      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQ(input.trim());
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="키워드 — 예: 닥터X, 김지원, 바람막이"
            className="h-10 min-w-[220px] flex-1 rounded-[10px] border border-input bg-[color:var(--surface-input)] px-3 text-[14px]"
          />
          <button disabled={!input.trim()} className="h-10 rounded-[10px] bg-brand px-5 text-[14px] font-bold text-brand-foreground hover:opacity-90 disabled:opacity-50">
            분석
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <Pill key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
                {p.label}
              </Pill>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[12.5px] font-bold text-[color:var(--text-faint)]">
            쇼핑 분야
            <select
              value={SHOP_CATS.some((c) => c.id === cid) || !cid ? cid : '__sub'}
              onChange={(e) => setCid(e.target.value)}
              className="h-8 rounded-[9px] border border-input bg-[color:var(--surface-input)] px-2 text-[13px] font-semibold text-foreground"
            >
              <option value="">선택 안 함 (상품 키워드일 때 고르세요)</option>
              {SHOP_CATS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              {cid && !SHOP_CATS.some((c) => c.id === cid) && <option value="__sub" disabled>하위 분야 ({cid})</option>}
            </select>
          </label>
        </div>
      </div>

      {err && <div className="surface-warn mb-3 rounded-xl border px-4 py-3 text-[13px] font-semibold">{err}</div>}
      {!q && (
        <p className="card-surface rounded-[22px] py-14 text-center text-[14px] font-semibold text-muted-foreground">
          키워드를 넣거나, 다른 칸에서 키워드 옆 「분석」을 누르세요
        </p>
      )}
      {q && loading && !data && <p className="px-1 text-[12.5px] font-semibold text-[color:var(--text-faint)]">불러오는 중… (출처가 여럿이라 10~20초 걸릴 수 있습니다)</p>}

      {data && (
        <div className={'space-y-2.5 ' + (loading ? 'opacity-60' : '')}>
          <h2 className="flex items-center gap-2 px-1 text-[20px] font-extrabold tracking-[-0.03em]">
            {data.q}
            <a href={naverSearchUrl(data.q)} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-bold text-brand hover:underline">
              네이버에서 보기 ↗
            </a>
          </h2>

          {/* 네이버 검색광고 지표 */}
          <Card title="네이버 검색량" aside="검색광고 키워드도구 · 최근 30일">
            {!data.volume.ok ? (
              data.volume.code === 'NO_SEARCHAD_KEY' ? <NeedKey what="네이버 검색광고 키가 없습니다" how="설정 → API 키에서 넣어 주세요." /> : failed(data.volume)
            ) : !v ? (
              <p className="text-[13px] text-[color:var(--text-faint)]">네이버에 이 키워드 데이터가 없습니다 (검색이 아주 적거나 띄어쓰기가 다를 수 있음)</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="월간 검색수" value={v.total <= 10 ? '<10' : short(v.total)} sub={`모바일 ${nf.format(v.mobile)} · PC ${nf.format(v.pc)}`} />
                {/* 클릭·클릭률은 검색 결과가 아니라 '광고' 기준이다. 광고가 없는 드라마·인물 키워드는 0 으로 온다 */}
                {v.adDepth ? (
                  <>
                    <Stat
                      label="월평균 광고 클릭"
                      value={short((v.pcClk ?? 0) + (v.mobileClk ?? 0))}
                      sub={`모바일 ${nf.format(Math.round(v.mobileClk ?? 0))} · PC ${nf.format(Math.round(v.pcClk ?? 0))}`}
                    />
                    <Stat label="광고 클릭률" value={`${(v.mobileCtr ?? 0).toFixed(2)}%`} sub={`모바일 기준 · PC ${(v.pcCtr ?? 0).toFixed(2)}%`} />
                  </>
                ) : (
                  <div className="col-span-2 flex items-center rounded-2xl px-4 py-3 text-[12.5px] font-semibold text-[color:var(--text-faint)]" style={{ background: 'var(--subtle)' }}>
                    이 키워드엔 검색 광고가 없어서 광고 클릭·클릭률이 없습니다 (드라마·인물 키워드는 보통 그렇습니다)
                  </div>
                )}
                <Stat label="광고 경쟁" value={v.comp ?? '—'} sub={v.adDepth ? `노출 광고 평균 ${v.adDepth}개` : '노출 광고 없음'} />
              </div>
            )}
          </Card>

          <div className="grid gap-2.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* 네이버 검색 추이 */}
            <Card
              title="네이버 검색 추이"
              aside={data.trend.ok ? `${data.trend.data.range.start} ~ ${data.trend.data.range.end} · 최댓값 = 100` : '데이터랩'}
            >
              {!data.trend.ok ? (
                data.trend.code === 'NO_NAVER_DEV_KEY' ? <NeedKey what="네이버 개발자센터 키가 필요합니다" how={DEV_KEY_HOW} /> : failed(data.trend)
              ) : (
                <TrendLine points={data.trend.data.total} label="검색" />
              )}
            </Card>

            {/* 연령대·성별·기기 상승세 */}
            <Card title="누가 더 찾기 시작했나" aside="최근 1/4 기간 평균 ÷ 앞 기간 평균">
              {!data.trend.ok ? (
                data.trend.code === 'NO_NAVER_DEV_KEY' ? <NeedKey what="개발자센터 키를 넣으면 켜집니다" how="연령대·성별·기기별로 검색이 오르는지 내리는지 보여 줍니다." /> : failed(data.trend)
              ) : (
                <div className="space-y-4">
                  <GrowthBars rows={data.trend.data.ages} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <GrowthBars rows={data.trend.data.gender} />
                    <GrowthBars rows={data.trend.data.device} />
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-[color:var(--text-faint)]">
                    네이버는 연령대마다 따로 100 으로 맞춰 주기 때문에 「어느 연령대가 더 많이 찾나」는 알 수 없고, 「어느 연령대에서 오르고 있나」만 비교할 수
                    있습니다. 연령대 비율은 아래 쇼핑 칸(상품 키워드)에서 볼 수 있습니다.
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* 화제성 */}
          <Card title="화제성" aside="네이버 뉴스·블로그·카페">
            {!data.buzz.ok ? (
              data.buzz.code === 'NO_NAVER_DEV_KEY' ? <NeedKey what="네이버 개발자센터 키가 필요합니다" how={DEV_KEY_HOW} /> : failed(data.buzz)
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="grid grid-cols-2 gap-2">
                  <Stat
                    label="최근 24시간 기사"
                    value={`${data.buzz.data.news.last24h}${data.buzz.data.news.last24h >= data.buzz.data.news.sampled && data.buzz.data.news.sampled > 0 ? '+' : ''}`}
                    sub={`최근 7일 ${data.buzz.data.news.last7d}${data.buzz.data.news.last7d >= data.buzz.data.news.sampled && data.buzz.data.news.sampled > 0 ? '+' : ''}건`}
                  />
                  <Stat label="뉴스 누적" value={short(data.buzz.data.news.total)} />
                  <Stat label="블로그 글" value={short(data.buzz.data.blog.total)} />
                  <Stat label="카페 글" value={short(data.buzz.data.cafe.total)} />
                </div>
                <ul className="space-y-1.5">
                  {data.buzz.data.news.latest.map((n) => (
                    <li key={n.link} className="flex items-baseline gap-2 text-[13px]">
                      <span className="num w-[64px] shrink-0 text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                        {n.pubDate ? new Date(n.pubDate).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : ''}
                      </span>
                      <a href={n.link} target="_blank" rel="noopener noreferrer" className="line-clamp-1 font-semibold hover:text-brand hover:underline">
                        {n.title}
                      </a>
                    </li>
                  ))}
                  {data.buzz.data.news.latest.length === 0 && <li className="text-[13px] text-[color:var(--text-faint)]">최근 기사 없음</li>}
                </ul>
              </div>
            )}
          </Card>

          {/* 쇼핑 */}
          {data.shopping && (
            <Card title="쇼핑에서 누가 찾나" aside={data.shopping.ok ? `${data.shopping.data.range.start} ~ ${data.shopping.data.range.end} · 쇼핑 클릭 기준` : '쇼핑인사이트'}>
              {!data.shopping.ok ? (
                failed(data.shopping)
              ) : data.shopping.data.ages.every((a) => !a.ratio) ? (
                <p className="text-[13px] text-[color:var(--text-faint)]">이 분야에서는 쇼핑 클릭이 없습니다. 분야를 바꿔 보세요.</p>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-[12px] font-bold text-muted-foreground">연령대 비율</div>
                      <BarList rows={shares(data.shopping.data.ages)} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="mb-2 text-[12px] font-bold text-muted-foreground">성별</div>
                        <BarList rows={shares(data.shopping.data.gender)} />
                      </div>
                      <div>
                        <div className="mb-2 text-[12px] font-bold text-muted-foreground">기기</div>
                        <BarList rows={shares(data.shopping.data.device)} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-[12px] font-bold text-muted-foreground">쇼핑 클릭 추이 (최댓값 = 100)</div>
                    <TrendLine points={data.shopping.data.trend} label="클릭" />
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 구글 */}
          <Card title="구글" aside="관심도 추이 · 지역 · 관련 주제">
            {!data.google.ok ? (
              data.google.code === 'NO_PROXY' ? <ProxyNotice what="구글 키워드 분석" /> : failed(data.google)
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-[12px] font-bold text-muted-foreground">관심도 추이 (최댓값 = 100)</div>
                    <TrendLine points={data.google.data.timeline} label="관심도" />
                  </div>
                  <div>
                    <div className="mb-2 text-[12px] font-bold text-muted-foreground">시·도별 관심도 (가장 높은 곳 = 100)</div>
                    {data.google.data.regions.length ? (
                      <BarList rows={data.google.data.regions.slice(0, 8).map((r) => ({ label: r.name, value: r.value }))} />
                    ) : (
                      <p className="text-[13px] text-[color:var(--text-faint)]">데이터 없음</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(
                    [
                      ['관련 주제 · 급상승', data.google.data.topics.rising],
                      ['관련 검색어 · 급상승', data.google.data.queries.rising],
                      ['관련 주제 · 인기', data.google.data.topics.top],
                      ['관련 검색어 · 인기', data.google.data.queries.top],
                    ] as const
                  ).map(([t, rows]) => (
                    <div key={t}>
                      <div className="mb-1.5 text-[12px] font-bold text-muted-foreground">{t}</div>
                      <ul className="space-y-1">
                        {rows.slice(0, 8).map((r) => (
                          <li key={r.query} className="flex items-baseline justify-between gap-2 text-[13px]">
                            <button onClick={() => onAnalyze(r.query)} className="truncate text-left font-semibold hover:text-brand hover:underline" title={`「${r.query}」 분석`}>
                              {r.query}
                            </button>
                            <span className="num shrink-0 text-[11.5px] font-bold text-[color:var(--text-faint)]">{r.label}</span>
                          </li>
                        ))}
                        {rows.length === 0 && <li className="text-[12.5px] text-[color:var(--text-faint)]">없음</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* 연관 키워드 */}
          <Card title="연관 키워드" aside="검색광고 · 검색수 많은 순">
            {!data.related.ok ? (
              failed(data.related)
            ) : data.related.data.length === 0 ? (
              <p className="text-[13px] text-[color:var(--text-faint)]">네이버가 연관 키워드를 주지 않았습니다 (드라마·인물 같은 키워드는 보통 없습니다)</p>
            ) : (
              <div className="grid gap-x-6 sm:grid-cols-2">
                {data.related.data.map((r) => (
                  <div key={r.keyword} className="flex items-center justify-between gap-2 py-1 text-[13px]" style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <button onClick={() => onAnalyze(r.keyword, cid || undefined)} className="truncate text-left font-semibold hover:text-brand hover:underline" title={`「${r.keyword}」 분석`}>
                      {r.keyword}
                    </button>
                    <span className="num shrink-0 font-bold">{r.total <= 10 ? '<10' : short(r.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
