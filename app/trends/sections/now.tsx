'use client';

import { useEffect, useMemo, useState } from 'react';
import { TRENDING_CATEGORIES } from '@/lib/trends/categories';
import { AnalyzeButton, NaverCell, Pill, StatusLine, ago, naverSearchUrl, short, type Naver } from '../ui';

/** 구글 급상승 — 최근 4시간~7일. 구글이 주는 최대가 7일이다 */
const HOURS = [
  { h: 4, label: '4시간' },
  { h: 24, label: '24시간' },
  { h: 48, label: '48시간' },
  { h: 168, label: '7일' },
];

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

export function NowSection({ onAnalyze }: { onAnalyze: (q: string) => void }) {
  const [hours, setHours] = useState(168);
  // 드라마·영화·인물이 이 탭을 만든 이유라 그걸 기본으로
  const [cat, setCat] = useState<number | null>(4);
  const [sort, setSort] = useState<'google' | 'naver' | 'recent'>('google');
  const [data, setData] = useState<{
    items: TrendingItem[];
    counts: Record<string, number>;
    total: number;
    matched: number;
    fetchedAt: string;
    naverEnabled: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ hours: String(hours), limit: '60' });
    if (cat !== null) qs.set('cat', String(cat));
    fetch(`/api/v1/trends/google?${qs}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.success ? setData(j.data) : setErr(j.error?.message ?? '불러오기 실패')))
      .catch((e) => e.name !== 'AbortError' && setErr((e as Error).message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [hours, cat]);

  const items = useMemo(() => {
    const list = [...(data?.items ?? [])];
    if (sort === 'naver') list.sort((a, b) => (b.naver?.total ?? -1) - (a.naver?.total ?? -1));
    else if (sort === 'recent') list.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
    return list;
  }, [data, sort]);
  const maxNaver = Math.max(0, ...items.map((i) => i.naver?.total ?? 0));
  const maxGoogle = Math.max(0, ...items.map((i) => i.volume));
  const hoursLabel = HOURS.find((x) => x.h === hours)?.label ?? '';

  return (
    <>
      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {HOURS.map((x) => (
              <Pill key={x.h} active={hours === x.h} onClick={() => setHours(x.h)}>
                {x.label}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-1 text-[12.5px]">
            <span className="mr-1 font-bold text-[color:var(--text-faint)]">정렬</span>
            <Pill active={sort === 'google'} onClick={() => setSort('google')}>구글 검색량</Pill>
            <Pill active={sort === 'naver'} onClick={() => setSort('naver')}>네이버 검색수</Pill>
            <Pill active={sort === 'recent'} onClick={() => setSort('recent')}>최신</Pill>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill strong active={cat === null} onClick={() => setCat(null)}>
            전체 {data ? <span className="num opacity-70">{data.total}</span> : null}
          </Pill>
          {TRENDING_CATEGORIES.map((c) => (
            <Pill strong key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {c.label} {data?.counts[c.id] ? <span className="num opacity-70">{data.counts[c.id]}</span> : null}
            </Pill>
          ))}
        </div>
      </div>

      <StatusLine
        loading={loading}
        err={err}
        fetchedAt={data?.fetchedAt}
        note={data ? `최근 ${hoursLabel} 급상승 ${data.matched}건 중 구글 검색량 상위 ${items.length}개 · 구글 검색량은 대략치(하한)` : undefined}
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
                  <NaverCell v={it.naver} max={maxNaver} enabled={data?.naverEnabled ?? true} />
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
  );
}
