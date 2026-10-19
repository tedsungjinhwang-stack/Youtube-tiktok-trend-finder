'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { TRENDING_CATEGORIES, EXPLORE_CATEGORIES } from '@/lib/trends/categories';

/**
 * 트렌드 — 드라마·영화·인물·쇼핑처럼 지금 트래픽이 몰리는 관심사를 찾는 탭.
 *
 * 숫자 출처가 섞여 있어서 칸마다 어디 숫자인지 이름을 붙인다.
 *  - 구글 검색량: 구글이 주는 대략치(하한, 10만+ 등)
 *  - 네이버 월간: 검색광고 키워드도구의 최근 30일 실제 검색수 (기간·연령 무관)
 */

type Naver = { pc: number; mobile: number; total: number; comp: string | null } | null;

type Section = 'now' | 'shopping' | 'period' | 'lookup';
const SECTIONS: { key: Section; label: string; hint: string }[] = [
  { key: 'now', label: '지금 뜨는 것', hint: '구글 급상승 · 24시간 / 7일' },
  { key: 'shopping', label: '연령대별 쇼핑', hint: '네이버 쇼핑인사이트' },
  { key: 'period', label: '1달 · 3달', hint: '구글 (프록시)' },
  { key: 'lookup', label: '검색수 조회', hint: '네이버 월간 검색수' },
];

const SHOP_CATS = [
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
];
const SHOP_PERIODS = [
  { key: '1d', label: '어제' },
  { key: '7d', label: '7일' },
  { key: '30d', label: '30일' },
  { key: '90d', label: '90일' },
];
const AGES = ['10', '20', '30', '40', '50', '60'];

const nf = new Intl.NumberFormat('ko-KR');

/** 98000 → '9.8만', 1200000 → '120만' */
function short(n: number): string {
  if (n >= 100_000_000) return `${Math.round(n / 100_000_000)}억`;
  if (n >= 100_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}만`;
  return nf.format(n);
}

function ago(iso: string | null): string {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(m, 1)}분 전`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

function naverSearchUrl(q: string) {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`;
}

/* ───────────────────────── 공용 조각 ───────────────────────── */

function Pill({
  active,
  onClick,
  children,
  strong,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** 강조형(파란 배경) — 분야처럼 하나를 고르는 칩 */
  strong?: boolean;
}) {
  if (strong) {
    return (
      <button
        onClick={onClick}
        className={
          'theme-fade h-7 shrink-0 rounded-[9px] px-2.5 text-[12.5px] font-bold ' +
          (active ? 'text-brand-foreground' : 'text-muted-foreground hover:text-foreground')
        }
        style={{ background: active ? 'var(--accent-solid)' : 'var(--chip)' }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={
        'theme-fade h-8 shrink-0 rounded-[10px] px-3 text-[13px] font-bold ' +
        (active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')
      }
      style={active ? { background: 'var(--chip)' } : undefined}
    >
      {children}
    </button>
  );
}

/** 네이버 월간 검색수 칸 — 막대는 같은 목록 안 최댓값 대비 */
function NaverCell({ v, max, enabled }: { v: Naver; max: number; enabled: boolean }) {
  if (!enabled) return <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">키 필요</span>;
  if (!v) return <span className="text-[12px] text-[color:var(--text-faint)]">—</span>;
  const pct = max > 0 ? Math.max(4, Math.round((v.total / max) * 100)) : 0;
  return (
    <span className="flex min-w-0 items-center gap-2" title={`PC ${nf.format(v.pc)} · 모바일 ${nf.format(v.mobile)}`}>
      <span className="hidden h-[6px] w-[64px] shrink-0 overflow-hidden rounded-full sm:block" style={{ background: 'var(--chip)' }}>
        <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </span>
      <span className="num text-[13px] font-bold">{v.total <= 10 ? '<10' : short(v.total)}</span>
    </span>
  );
}

function StatusLine({ loading, err, fetchedAt, note }: { loading: boolean; err: string | null; fetchedAt?: string | null; note?: string }) {
  if (err)
    return (
      <div className="surface-warn mb-3 rounded-xl border px-4 py-3 text-[13px] font-semibold">{err}</div>
    );
  return (
    <p className="mb-2 px-1 text-[12px] font-semibold text-[color:var(--text-faint)]">
      {loading ? '불러오는 중… (처음엔 네이버 검색수까지 붙이느라 10초쯤 걸릴 수 있습니다)' : note}
      {!loading && fetchedAt && <> · {ago(fetchedAt)} 기준</>}
    </p>
  );
}

/* ───────────────────────── 1. 지금 뜨는 것 (구글 급상승) ───────────────────────── */

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

function NowSection() {
  const [hours, setHours] = useState<24 | 168>(168);
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

  return (
    <>
      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Pill active={hours === 24} onClick={() => setHours(24)}>24시간</Pill>
            <Pill active={hours === 168} onClick={() => setHours(168)}>7일</Pill>
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
        note={
          data
            ? `${hours === 24 ? '최근 24시간' : '최근 7일'} 급상승 ${data.matched}건 중 구글 검색량 상위 ${items.length}개 · 구글 검색량은 대략치(하한)`
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
                className="row-hover grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-[22px] py-3 md:grid-cols-[40px_minmax(0,1fr)_150px_150px_76px] md:items-center"
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
                  </div>
                  {it.related.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {it.related.slice(0, 4).map((r) => (
                        <span key={r} className="rounded-md px-1.5 py-px text-[11.5px] font-semibold text-[color:var(--text-quaternary)]" style={{ background: 'var(--chip)' }}>
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* 좁은 화면에선 숫자 둘을 검색어 아래 한 줄로 */}
                <span className="col-start-2 flex items-center gap-2 md:col-start-auto">
                  <span className="md:hidden text-[11.5px] font-bold text-[color:var(--text-faint)]">구글</span>
                  <span className="hidden h-[6px] w-[64px] shrink-0 overflow-hidden rounded-full sm:block" style={{ background: 'var(--chip)' }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${maxGoogle ? Math.max(4, Math.round((it.volume / maxGoogle) * 100)) : 0}%`, background: 'var(--amber)' }}
                    />
                  </span>
                  <span className="num text-[13px] font-bold">{short(it.volume)}+</span>
                </span>
                <span className="col-start-2 flex items-center gap-2 md:col-start-auto">
                  <span className="md:hidden text-[11.5px] font-bold text-[color:var(--text-faint)]">네이버</span>
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

/* ───────────────────────── 2. 연령대별 쇼핑 (네이버) ───────────────────────── */

type ShopRow = { age: string; items: { rank: number; keyword: string; naver: Naver }[] };

function ShoppingSection() {
  const [cid, setCid] = useState(SHOP_CATS[0].id);
  const [period, setPeriod] = useState('30d');
  const [gender, setGender] = useState<'' | 'f' | 'm'>('');
  const [age, setAge] = useState<'all' | string>('all');
  const [sort, setSort] = useState<'rank' | 'naver'>('rank');
  const [data, setData] = useState<{ rows: ShopRow[]; range: { start: string; end: string }; fetchedAt: string; naverEnabled: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ cid, period, gender, age });
    fetch(`/api/v1/trends/naver-shopping?${qs}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.success ? setData(j.data) : setErr(j.error?.message ?? '불러오기 실패')))
      .catch((e) => e.name !== 'AbortError' && setErr((e as Error).message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [cid, period, gender, age]);

  const rows = useMemo(
    () =>
      (data?.rows ?? []).map((r) => ({
        ...r,
        items: sort === 'naver' ? [...r.items].sort((a, b) => (b.naver?.total ?? -1) - (a.naver?.total ?? -1)) : r.items,
      })),
    [data, sort]
  );
  // 한 연령대에만 있는 키워드 — 그 연령대의 고유 관심사
  const onlyHere = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const r of rows) {
      const others = new Set(rows.filter((x) => x.age !== r.age).flatMap((x) => x.items.map((i) => i.keyword)));
      out.set(r.age, new Set(r.items.map((i) => i.keyword).filter((k) => !others.has(k))));
    }
    return out;
  }, [rows]);
  const maxNaver = Math.max(0, ...rows.flatMap((r) => r.items.map((i) => i.naver?.total ?? 0)));
  const compare = age === 'all';

  return (
    <>
      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap gap-1.5">
          {SHOP_CATS.map((c) => (
            <Pill strong key={c.id} active={cid === c.id} onClick={() => setCid(c.id)}>
              {c.label}
            </Pill>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1">
            {SHOP_PERIODS.map((p) => (
              <Pill key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
                {p.label}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Pill active={gender === ''} onClick={() => setGender('')}>전체</Pill>
            <Pill active={gender === 'f'} onClick={() => setGender('f')}>여성</Pill>
            <Pill active={gender === 'm'} onClick={() => setGender('m')}>남성</Pill>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Pill active={compare} onClick={() => setAge('all')}>연령대 비교</Pill>
            {AGES.map((a) => (
              <Pill key={a} active={age === a} onClick={() => setAge(a)}>
                {a}대
              </Pill>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-1 text-[12.5px] font-bold text-[color:var(--text-faint)]">정렬</span>
            <Pill active={sort === 'rank'} onClick={() => setSort('rank')}>네이버 순위</Pill>
            <Pill active={sort === 'naver'} onClick={() => setSort('naver')}>검색수</Pill>
          </div>
        </div>
      </div>

      <StatusLine
        loading={loading}
        err={err}
        fetchedAt={data?.fetchedAt}
        note={
          data
            ? `${data.range.start} ~ ${data.range.end} · 순위는 네이버 쇼핑 클릭 기준, 검색수는 최근 30일 전체 기준` +
              (compare ? ' · 파란 점 = 그 연령대에만 있는 키워드' : '')
            : undefined
        }
      />

      {compare ? (
        <div className={'overflow-x-auto pb-1 ' + (loading ? 'opacity-60' : '')}>
          <div className="grid min-w-[980px] grid-cols-6 gap-2">
            {rows.map((r) => (
              <section key={r.age} className="card-surface theme-fade rounded-[20px] px-3 py-3">
                <h3 className="mb-2 px-1 text-[14px] font-extrabold">{r.age}대</h3>
                <ol className="space-y-1">
                  {r.items.map((it, i) => {
                    const unique = onlyHere.get(r.age)?.has(it.keyword);
                    return (
                      <li key={it.keyword} className="row-hover flex items-center gap-1.5 rounded-lg px-1 py-1">
                        <span className="num w-4 shrink-0 text-right text-[11.5px] font-bold text-[color:var(--text-faint)]">
                          {sort === 'rank' ? it.rank : i + 1}
                        </span>
                        {unique && <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-brand" title="이 연령대에만 있음" />}
                        <a
                          href={naverSearchUrl(it.keyword)}
                          target="_blank"
                          rel="noopener noreferrer"
                          // 칸이 좁아 한 줄로 자르면 '폴로후드...'처럼 못 알아본다 → 두 줄까지
                          className={'line-clamp-2 min-w-0 flex-1 break-all text-[13px] font-bold leading-snug hover:underline ' + (unique ? 'text-brand' : '')}
                          title={it.keyword}
                        >
                          {it.keyword}
                        </a>
                        <span className="num shrink-0 text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                          {data?.naverEnabled === false ? '' : it.naver ? short(it.naver.total) : '—'}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <section className={'card-surface theme-fade overflow-hidden rounded-[22px] ' + (loading ? 'opacity-60' : '')}>
          <table className="w-full text-[14px]">
            <thead className="subtle-surface text-[11.5px] font-extrabold tracking-[0.04em] text-[color:var(--text-quaternary)]">
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="w-12 px-4 py-2 text-left">순위</th>
                <th className="px-2 py-2 text-left">키워드</th>
                <th className="w-[190px] px-2 py-2 text-left">네이버 월간</th>
                <th className="hidden w-[110px] px-2 py-2 text-right sm:table-cell">PC</th>
                <th className="hidden w-[110px] px-2 py-2 text-right sm:table-cell">모바일</th>
                <th className="hidden w-[80px] px-4 py-2 text-right md:table-cell">경쟁</th>
              </tr>
            </thead>
            <tbody>
              {(rows[0]?.items ?? []).map((it) => (
                <tr key={it.keyword} className="row-hover" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <td className="num px-4 py-2.5 text-[13px] font-bold text-[color:var(--text-faint)]">{it.rank}</td>
                  <td className="px-2 py-2.5">
                    <a href={naverSearchUrl(it.keyword)} target="_blank" rel="noopener noreferrer" className="font-bold hover:text-brand hover:underline">
                      {it.keyword}
                    </a>
                  </td>
                  <td className="px-2 py-2.5">
                    <NaverCell v={it.naver} max={maxNaver} enabled={data?.naverEnabled ?? true} />
                  </td>
                  <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] sm:table-cell">
                    {it.naver ? nf.format(it.naver.pc) : '—'}
                  </td>
                  <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] sm:table-cell">
                    {it.naver ? nf.format(it.naver.mobile) : '—'}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right text-[12.5px] text-[color:var(--text-faint)] md:table-cell">
                    {it.naver?.comp ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

/* ───────────────────────── 3. 1달·3달 (구글, 프록시) ───────────────────────── */

type Related = { query: string; value: number; label: string; naver: Naver };

function PeriodSection() {
  const [period, setPeriod] = useState<'1m' | '3m'>('1m');
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
    const qs = new URLSearchParams({ period, cat: String(cat), q });
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
  }, [period, cat, q]);

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
              <li key={r.query} className="row-hover grid grid-cols-[24px_minmax(0,1fr)_72px_120px] items-center gap-2 px-[22px] py-2" style={{ borderTop: '1px solid var(--hairline)' }}>
                <span className="num text-[12px] font-bold text-[color:var(--text-faint)]">{i + 1}</span>
                <a href={naverSearchUrl(r.query)} target="_blank" rel="noopener noreferrer" className="truncate text-[14px] font-bold hover:text-brand hover:underline">
                  {r.query}
                </a>
                <span className={'num text-right text-[12.5px] font-bold ' + (kind === 'rising' ? 'text-[color:var(--green)]' : '')}>{r.label}</span>
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
          <div className="flex items-center gap-1">
            <Pill active={period === '1m'} onClick={() => setPeriod('1m')}>1달</Pill>
            <Pill active={period === '3m'} onClick={() => setPeriod('3m')}>3달</Pill>
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
          <h3 className="text-[15px] font-extrabold">프록시를 넣으면 켜집니다</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            구글은 서버 IP 에서 오는 1달·3달 조회를 막습니다(429). 인베스트 시그널에서 쓰는 ISP 프록시를 거치면 받을 수 있습니다.
            <br />
            <Link href="/settings/api-keys" className="font-bold text-brand hover:underline">
              설정 → API 키
            </Link>{' '}
            의 「구글 트렌드 프록시」에 <code className="rounded bg-[color:var(--chip)] px-1">BINANCE_PROXY</code> 와 같은 값(
            <code className="rounded bg-[color:var(--chip)] px-1">http://아이디:비번@IP:포트</code>)을 넣어 주세요.
          </p>
        </div>
      ) : (
        <>
          <StatusLine
            loading={loading}
            err={err}
            fetchedAt={data?.fetchedAt}
            note={data ? `구글 ${period === '1m' ? '최근 1달' : '최근 3달'} · 숫자는 상대값 (실제 검색수는 네이버 월간 칸)` : undefined}
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

/* ───────────────────────── 4. 검색수 조회 ───────────────────────── */

function LookupSection() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<{ keyword: string; naver: Naver }[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    const kw = text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).join(',');
    if (!kw) return;
    setLoading(true);
    setErr(null);
    try {
      const j = await fetch(`/api/v1/trends/volume?kw=${encodeURIComponent(kw)}`, { cache: 'no-store' }).then((r) => r.json());
      if (!j.success) throw new Error(j.error?.message ?? '조회 실패');
      setEnabled(j.data.naverEnabled);
      setRows([...j.data.items].sort((a, b) => (b.naver?.total ?? -1) - (a.naver?.total ?? -1)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const max = Math.max(0, ...rows.map((r) => r.naver?.total ?? 0));

  return (
    <>
      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <p className="mb-2 text-[13px] font-semibold text-muted-foreground">
          드라마·배우·상품 이름을 쉼표나 줄바꿈으로 넣으면 네이버 최근 30일 검색수를 비교합니다 (최대 30개)
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
            }}
            rows={2}
            placeholder="닥터X, 김지원, 눈물의 여왕"
            className="min-h-[44px] flex-1 rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2.5 py-2 text-[13.5px]"
          />
          <button
            onClick={run}
            disabled={loading || !text.trim()}
            className="h-11 shrink-0 rounded-[10px] bg-brand px-5 text-[14px] font-bold text-brand-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '조회 중…' : '조회'}
          </button>
        </div>
      </div>
      {err && <div className="surface-warn mb-3 rounded-xl border px-4 py-3 text-[13px] font-semibold">{err}</div>}
      {!enabled && (
        <div className="surface-warn mb-3 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          네이버 검색광고 키가 없습니다. 설정 → API 키에서 넣어 주세요.
        </div>
      )}
      {rows.length > 0 && (
        <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
          <table className="w-full text-[14px]">
            <thead className="subtle-surface text-[11.5px] font-extrabold tracking-[0.04em] text-[color:var(--text-quaternary)]">
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="px-[22px] py-2 text-left">키워드</th>
                <th className="w-[200px] px-2 py-2 text-left">네이버 월간</th>
                <th className="hidden w-[110px] px-2 py-2 text-right sm:table-cell">PC</th>
                <th className="hidden w-[110px] px-2 py-2 text-right sm:table-cell">모바일</th>
                <th className="hidden w-[80px] px-[22px] py-2 text-right md:table-cell">경쟁</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.keyword} className="row-hover" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <td className="px-[22px] py-2.5">
                    <a href={naverSearchUrl(r.keyword)} target="_blank" rel="noopener noreferrer" className="font-bold hover:text-brand hover:underline">
                      {r.keyword}
                    </a>
                  </td>
                  <td className="px-2 py-2.5">
                    {r.naver || !enabled ? (
                      <NaverCell v={r.naver} max={max} enabled={enabled} />
                    ) : (
                      <span className="text-[12px] text-[color:var(--text-faint)]">네이버 데이터 없음</span>
                    )}
                  </td>
                  <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] sm:table-cell">
                    {r.naver ? nf.format(r.naver.pc) : '—'}
                  </td>
                  <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] sm:table-cell">
                    {r.naver ? nf.format(r.naver.mobile) : '—'}
                  </td>
                  <td className="hidden px-[22px] py-2.5 text-right text-[12.5px] text-[color:var(--text-faint)] md:table-cell">
                    {r.naver?.comp ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

/* ───────────────────────── 페이지 ───────────────────────── */

const SECTION_KEY = 'saeroi-trends-section';

export function TrendsClient() {
  const [section, setSection] = useState<Section>('now');

  // ?s=shopping 처럼 주소로 바로 열 수 있고, 없으면 마지막으로 보던 칸 (편의용 — 실패해도 기본 칸으로)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('s') as Section | null;
    if (fromUrl && SECTIONS.some((x) => x.key === fromUrl)) {
      setSection(fromUrl);
      return;
    }
    try {
      const s = localStorage.getItem(SECTION_KEY) as Section | null;
      if (s && SECTIONS.some((x) => x.key === s)) setSection(s);
    } catch {
      /* 저장소 막힘 */
    }
  }, []);
  const pick = (s: Section) => {
    setSection(s);
    try {
      localStorage.setItem(SECTION_KEY, s);
    } catch {
      /* 저장소 막힘 */
    }
  };

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-5 xl:px-0 xl:pt-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">트렌드</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            드라마·영화·인물·쇼핑 — 지금 검색이 몰리는 관심사
          </p>
        </div>
      </div>

      <div role="tablist" className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {SECTIONS.map((s) => {
          const active = section === s.key;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={active}
              onClick={() => pick(s.key)}
              className={
                'theme-fade flex shrink-0 flex-col items-start rounded-[14px] px-4 py-2.5 text-left ' +
                (active ? 'card-surface' : 'hover:bg-[color:var(--chip)]')
              }
            >
              <span className={'text-[14px] font-extrabold ' + (active ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span>
              <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">{s.hint}</span>
            </button>
          );
        })}
      </div>

      {section === 'now' && <NowSection />}
      {section === 'shopping' && <ShoppingSection />}
      {section === 'period' && <PeriodSection />}
      {section === 'lookup' && <LookupSection />}
    </div>
  );
}
