'use client';

import { useEffect, useMemo, useState } from 'react';
import { TRENDING_CATEGORIES, TRENDING_TO_EXPLORE } from '@/lib/trends/categories';
import { AnalyzeButton, NaverCell, Pill, StatusLine, ago, naverSearchUrl, short, type Naver } from '../ui';
import { PROPS, ProxyNotice, RelatedList, type Related } from './period';

/**
 * 구글 — 4시간부터 3달까지 한 칸에서.
 * 7일까지는 '급상승'(검색량·같이 찾은 말), 1달·3달은 explore(인기·급상승 검색어, 상대값)라
 * 구글이 주는 형식이 달라서 목록 모양만 기간에 따라 바뀐다. 분야 칩은 같은 걸 쓴다.
 */
const PERIODS = [
  { key: '4', label: '4시간' },
  { key: '24', label: '24시간' },
  { key: '48', label: '48시간' },
  { key: '168', label: '7일' },
  { key: '1m', label: '1달' },
  { key: '3m', label: '3달' },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];
const isLong = (p: PeriodKey) => p === '1m' || p === '3m';

type TrendingItem = {
  query: string;
  volume: number;
  growth: number | null;
  startedAt: string | null;
  active: boolean;
  categories: number[];
  related: string[];
  naver: Naver;
};
type ShortData = {
  items: TrendingItem[];
  counts: Record<string, number>;
  total: number;
  matched: number;
  fetchedAt: string;
  naverEnabled: boolean;
};
type LongData = { top: Related[]; rising: Related[]; fetchedAt: string; naverEnabled: boolean };

export function NowSection({ onAnalyze }: { onAnalyze: (q: string) => void }) {
  const [period, setPeriod] = useState<PeriodKey>('168');
  // 드라마·영화·인물이 이 탭을 만든 이유라 그걸 기본으로
  const [cat, setCat] = useState<number | null>(4);
  const [sort, setSort] = useState<'google' | 'naver' | 'recent'>('google');
  // 1달·3달 전용
  const [prop, setProp] = useState('youtube');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  const [shortData, setShortData] = useState<ShortData | null>(null);
  const [longData, setLongData] = useState<LongData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [noProxy, setNoProxy] = useState(false);

  // ?p=1m 처럼 주소로 기간을 바로 열 수 있게
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('p');
    if (p && PERIODS.some((x) => x.key === p)) setPeriod(p as PeriodKey);
  }, []);

  const long = isLong(period);
  // 1달·3달엔 대응 분야가 없는 칩(날씨·기타)이 있다
  const exploreCat = cat === null ? 0 : TRENDING_TO_EXPLORE[cat];
  const catUnavailable = long && exploreCat == null;

  useEffect(() => {
    if (catUnavailable) return;
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    setNoProxy(false);
    const url = long
      ? `/api/v1/trends/google-period?${new URLSearchParams({ period, cat: String(exploreCat ?? 0), q, prop })}`
      : `/api/v1/trends/google?${new URLSearchParams({ hours: period, limit: '60', ...(cat !== null ? { cat: String(cat) } : {}) })}`;
    fetch(url, { signal: ac.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.success) (long ? setLongData : setShortData)(j.data);
        else if (j.error?.code === 'NO_PROXY') setNoProxy(true);
        else setErr(j.error?.message ?? '불러오기 실패');
      })
      .catch((e) => e.name !== 'AbortError' && setErr((e as Error).message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [period, cat, q, prop, long, exploreCat, catUnavailable]);

  const items = useMemo(() => {
    const list = [...(shortData?.items ?? [])];
    if (sort === 'naver') list.sort((a, b) => (b.naver?.total ?? -1) - (a.naver?.total ?? -1));
    else if (sort === 'recent') list.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
    return list;
  }, [shortData, sort]);
  const sortLong = (rows: Related[]) =>
    sort === 'naver' ? [...rows].sort((a, b) => (b.naver?.total ?? -1) - (a.naver?.total ?? -1)) : rows;
  const maxNaver = Math.max(0, ...items.map((i) => i.naver?.total ?? 0));
  const maxGoogle = Math.max(0, ...items.map((i) => i.volume));
  const periodLabel = PERIODS.find((x) => x.key === period)?.label ?? '';

  return (
    <>
      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {PERIODS.map((x) => (
              <Pill
                key={x.key}
                active={period === x.key}
                onClick={() => {
                  setPeriod(x.key);
                  // 1달·3달엔 '최신' 정렬이 없다 (시작 시각이 없음)
                  if (isLong(x.key) && sort === 'recent') setSort('google');
                }}
              >
                {x.label}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[12.5px]">
            <span className="mr-1 font-bold text-[color:var(--text-faint)]">정렬</span>
            <Pill active={sort === 'google'} onClick={() => setSort('google')}>{long ? '구글 순위' : '구글 검색량'}</Pill>
            <Pill active={sort === 'naver'} onClick={() => setSort('naver')}>네이버 검색수</Pill>
            {!long && <Pill active={sort === 'recent'} onClick={() => setSort('recent')}>최신</Pill>}
          </div>
        </div>

        {/* 1달·3달: 검색 기준 + 주제어 */}
        {long && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[12.5px] font-bold text-[color:var(--text-faint)]">검색 기준</span>
              {PROPS.map((p) => (
                <Pill key={p.key} active={prop === p.key} onClick={() => setProp(p.key)}>
                  {p.label}
                </Pill>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setQ(qInput.trim());
              }}
              className="flex items-center gap-1.5"
            >
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="주제어 (선택) — 예: 드라마"
                className="h-9 w-[200px] rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2.5 text-[13px]"
              />
              <button className="h-9 rounded-[10px] bg-brand px-3 text-[13px] font-bold text-brand-foreground hover:opacity-90">조회</button>
            </form>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill strong active={cat === null} onClick={() => setCat(null)}>
            전체 {!long && shortData ? <span className="num opacity-70">{shortData.total}</span> : null}
          </Pill>
          {TRENDING_CATEGORIES.map((c) => {
            const off = long && TRENDING_TO_EXPLORE[c.id] == null;
            return (
              <span key={c.id} title={off ? '1달·3달엔 이 분야가 없습니다' : undefined} className={off ? 'opacity-40' : undefined}>
                <Pill strong active={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.label} {!long && shortData?.counts[c.id] ? <span className="num opacity-70">{shortData.counts[c.id]}</span> : null}
                </Pill>
              </span>
            );
          })}
        </div>
      </div>

      {catUnavailable ? (
        <p className="card-surface rounded-[22px] py-14 text-center text-[14px] font-semibold text-muted-foreground">
          1달·3달엔 이 분야가 없습니다. 다른 분야를 고르거나 7일 이하로 보세요.
        </p>
      ) : noProxy ? (
        <div className="card-surface theme-fade rounded-[22px] px-[22px] py-6">
          <h3 className="mb-2 text-[15px] font-extrabold">구글이 막았습니다 — 프록시를 넣으면 켜집니다</h3>
          <ProxyNotice />
        </div>
      ) : long ? (
        <>
          <StatusLine
            loading={loading}
            err={err}
            fetchedAt={longData?.fetchedAt}
            note={
              longData
                ? `구글 ${PROPS.find((p) => p.key === prop)?.label} · 최근 ${periodLabel} · 숫자는 상대값 (실제 검색수는 네이버 월간 칸)`
                : undefined
            }
          />
          {longData && (
            <div className={'grid gap-2.5 lg:grid-cols-2 ' + (loading ? 'opacity-60' : '')}>
              <RelatedList title="인기 검색어" rows={sortLong(longData.top)} kind="top" naverEnabled={longData.naverEnabled} onAnalyze={onAnalyze} />
              <RelatedList title="급상승 검색어" rows={sortLong(longData.rising)} kind="rising" naverEnabled={longData.naverEnabled} onAnalyze={onAnalyze} />
            </div>
          )}
        </>
      ) : (
        <>
          <StatusLine
            loading={loading}
            err={err}
            fetchedAt={shortData?.fetchedAt}
            note={
              shortData
                ? `최근 ${periodLabel} 급상승 ${shortData.matched}건 중 구글 검색량 상위 ${items.length}개 · 구글 검색량은 대략치(하한)`
                : undefined
            }
          />
          {!loading && items.length === 0 && !err ? (
            <p className="card-surface rounded-[22px] py-14 text-center text-[14px] font-semibold text-muted-foreground">
              이 분야에는 급상승 검색어가 없습니다
            </p>
          ) : (
            <section className={'card-surface theme-fade overflow-hidden rounded-[22px] ' + (loading ? 'opacity-60' : '')}>
              <div
                className="subtle-surface hidden grid-cols-[40px_minmax(0,1fr)_150px_150px_76px] gap-3 px-[22px] py-2 text-[11.5px] font-extrabold tracking-[0.04em] text-[color:var(--text-quaternary)] md:grid"
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <span>#</span>
                <span>검색어 · 같이 찾은 말</span>
                <span>구글 검색량</span>
                <span>네이버 월간</span>
                <span className="text-right">시작</span>
              </div>
              <ul>
                {items.map((it, i) => (
                  <li
                    key={it.query}
                    className="group row-hover grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-[22px] py-3 md:grid-cols-[40px_minmax(0,1fr)_150px_150px_76px] md:items-center"
                    style={{ borderBottom: '1px solid var(--hairline)' }}
                  >
                    <span className="num text-[13px] font-bold text-[color:var(--text-faint)]">{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <a
                          href={naverSearchUrl(it.query)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[15px] font-bold hover:text-brand hover:underline"
                        >
                          {it.query}
                        </a>
                        {it.active && (
                          <span className="shrink-0 rounded-md px-1.5 py-px text-[11px] font-bold" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
                            진행 중
                          </span>
                        )}
                        {/* 상승률은 구글이 +1,000% 에서 잘라서 거의 모든 줄이 같은 값이라 표시하지 않는다 */}
                        <AnalyzeButton q={it.query} onAnalyze={onAnalyze} />
                      </div>
                      {it.related.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {it.related.slice(0, 4).map((r) => (
                            <button
                              key={r}
                              onClick={() => onAnalyze(r)}
                              title={`「${r}」 키워드 분석`}
                              className="rounded-md px-1.5 py-px text-[11.5px] font-semibold text-[color:var(--text-quaternary)] hover:text-foreground"
                              style={{ background: 'var(--chip)' }}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* 좁은 화면에선 숫자 둘을 검색어 아래 한 줄로 */}
                    <span className="col-start-2 flex items-center gap-2 md:col-start-auto">
                      <span className="text-[11.5px] font-bold text-[color:var(--text-faint)] md:hidden">구글</span>
                      <span className="hidden h-[6px] w-[64px] shrink-0 overflow-hidden rounded-full sm:block" style={{ background: 'var(--chip)' }}>
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${maxGoogle ? Math.max(4, Math.round((it.volume / maxGoogle) * 100)) : 0}%`,
                            background: 'var(--text-quaternary)',
                          }}
                        />
                      </span>
                      <span className="num text-[13px] font-bold">{short(it.volume)}+</span>
                    </span>
                    <span className="col-start-2 flex items-center gap-2 md:col-start-auto">
                      <span className="text-[11.5px] font-bold text-[color:var(--text-faint)] md:hidden">네이버</span>
                      <NaverCell v={it.naver} max={maxNaver} enabled={shortData?.naverEnabled ?? true} />
                    </span>
                    <span className="col-start-2 text-[12px] font-semibold text-[color:var(--text-faint)] md:col-start-auto md:text-right">
                      {ago(it.startedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
