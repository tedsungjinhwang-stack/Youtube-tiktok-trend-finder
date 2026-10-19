'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EXPLORE_CATEGORIES } from '@/lib/trends/categories';
import { AnalyzeButton, NaverCell, Pill, StatusLine, naverSearchUrl, type Naver } from '../ui';

/** 구글 트렌드 '검색 기준' — 유튜브 검색이 채널 소재 찾기엔 가장 직접적이다 */
const PROPS = [
  { key: '', label: '웹 검색' },
  { key: 'youtube', label: '유튜브 검색' },
  { key: 'froogle', label: '구글 쇼핑' },
  { key: 'news', label: '뉴스' },
];

type Related = { query: string; value: number; label: string; naver: Naver };

export function ProxyNotice({ what = '구글 1달·3달 조회' }: { what?: string }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-muted-foreground">
      {what}는 프록시가 필요합니다. 구글이 서버 IP 에서 오는 요청을 막아서(429), 인베스트 시그널에서 쓰는 ISP 프록시를 거쳐야 합니다.
      <br />
      <Link href="/settings/api-keys" className="font-bold text-brand hover:underline">
        설정 → API 키
      </Link>{' '}
      의 「구글 트렌드 프록시」에 <code className="rounded bg-[color:var(--chip)] px-1">BINANCE_PROXY</code> 와 같은 값(
      <code className="rounded bg-[color:var(--chip)] px-1">http://아이디:비번@IP:포트</code>)을 넣어 주세요.
    </p>
  );
}

export function PeriodSection({ onAnalyze }: { onAnalyze: (q: string) => void }) {
  const [period, setPeriod] = useState<'1m' | '3m'>('1m');
  const [prop, setProp] = useState('youtube');
  const [cat, setCat] = useState(3);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ top: Related[]; rising: Related[]; fetchedAt: string; naverEnabled: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [noProxy, setNoProxy] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    setNoProxy(false);
    const qs = new URLSearchParams({ period, cat: String(cat), q, prop });
    fetch(`/api/v1/trends/google-period?${qs}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j.data);
        else if (j.error?.code === 'NO_PROXY') setNoProxy(true);
        else setErr(j.error?.message ?? '불러오기 실패');
      })
      .catch((e) => e.name !== 'AbortError' && setErr((e as Error).message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [period, cat, q, prop]);

  const list = (title: string, rows: Related[], kind: 'top' | 'rising') => {
    const maxNaver = Math.max(0, ...rows.map((r) => r.naver?.total ?? 0));
    return (
      <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
        <div className="flex items-center justify-between px-[22px] py-3">
          <h3 className="text-[14px] font-extrabold">{title}</h3>
          <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
            {kind === 'top' ? '1위 = 100' : '이전 기간 대비 증가율'}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-[22px] pb-6 text-[13px] text-[color:var(--text-faint)]">없음</p>
        ) : (
          <ul>
            {rows.map((r, i) => (
              <li
                key={r.query}
                className="group row-hover grid grid-cols-[24px_minmax(0,1fr)_72px_120px] items-center gap-2 px-[22px] py-2"
                style={{ borderTop: '1px solid var(--hairline)' }}
              >
                <span className="num text-[12px] font-bold text-[color:var(--text-faint)]">{i + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <a href={naverSearchUrl(r.query)} target="_blank" rel="noopener noreferrer" className="truncate text-[14px] font-bold hover:text-brand hover:underline">
                    {r.query}
                  </a>
                  <AnalyzeButton q={r.query} onAnalyze={onAnalyze} />
                </span>
                <span className="num text-right text-[12.5px] font-bold">{r.label}</span>
                <NaverCell v={r.naver} max={maxNaver} enabled={data?.naverEnabled ?? true} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <>
      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1">
              <Pill active={period === '1m'} onClick={() => setPeriod('1m')}>1달</Pill>
              <Pill active={period === '3m'} onClick={() => setPeriod('3m')}>3달</Pill>
            </div>
            <div className="flex items-center gap-1">
              {PROPS.map((p) => (
                <Pill key={p.key} active={prop === p.key} onClick={() => setProp(p.key)}>
                  {p.label}
                </Pill>
              ))}
            </div>
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
              className="h-9 w-[220px] rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2.5 text-[13px]"
            />
            <button className="h-9 rounded-[10px] bg-brand px-3 text-[13px] font-bold text-brand-foreground hover:opacity-90">조회</button>
          </form>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXPLORE_CATEGORIES.map((c) => (
            <Pill strong key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {c.label}
            </Pill>
          ))}
        </div>
      </div>

      {noProxy ? (
        <div className="card-surface theme-fade rounded-[22px] px-[22px] py-6">
          <h3 className="mb-2 text-[15px] font-extrabold">프록시를 넣으면 켜집니다</h3>
          <ProxyNotice />
        </div>
      ) : (
        <>
          <StatusLine
            loading={loading}
            err={err}
            fetchedAt={data?.fetchedAt}
            note={
              data
                ? `구글 ${PROPS.find((p) => p.key === prop)?.label} · ${period === '1m' ? '최근 1달' : '최근 3달'} · 숫자는 상대값 (실제 검색수는 네이버 월간 칸)`
                : undefined
            }
          />
          {data && (
            <div className={'grid gap-2.5 lg:grid-cols-2 ' + (loading ? 'opacity-60' : '')}>
              {list('인기 검색어', data.top, 'top')}
              {list('급상승 검색어', data.rising, 'rising')}
            </div>
          )}
        </>
      )}
    </>
  );
}
