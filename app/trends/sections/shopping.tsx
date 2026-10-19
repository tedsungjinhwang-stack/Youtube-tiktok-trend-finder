'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnalyzeButton, NaverCell, Pill, StatusLine, nf, naverSearchUrl, short, type Naver } from '../ui';

export const SHOP_CATS = [
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

type ShopRow = { age: string; items: { rank: number; keyword: string; naver: Naver }[] };
type Cat = { cid: string; name: string; parents: { cid: string; name: string }[]; children: { cid: string; name: string; leaf: boolean }[] };

export function ShoppingSection({ onAnalyze }: { onAnalyze: (q: string, cid?: string) => void }) {
  const [cid, setCid] = useState(SHOP_CATS[0].id);
  const [cat, setCat] = useState<Cat | null>(null);
  const [period, setPeriod] = useState('30d');
  const [gender, setGender] = useState<'' | 'f' | 'm'>('');
  const [device, setDevice] = useState<'' | 'pc' | 'mo'>('');
  const [age, setAge] = useState<'all' | 'total' | string>('all');
  const [count, setCount] = useState(20);
  const [sort, setSort] = useState<'rank' | 'naver'>('rank');
  const [data, setData] = useState<{ rows: ShopRow[]; range: { start: string; end: string }; fetchedAt: string; naverEnabled: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 하위 분야 목록
  useEffect(() => {
    const ac = new AbortController();
    fetch(`/api/v1/trends/naver-category?cid=${cid}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j) => j.success && setCat(j.data))
      .catch(() => {});
    return () => ac.abort();
  }, [cid]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setErr(null);
    const qs = new URLSearchParams({ cid, period, gender, device, age, count: String(count) });
    fetch(`/api/v1/trends/naver-shopping?${qs}`, { signal: ac.signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.success ? setData(j.data) : setErr(j.error?.message ?? '불러오기 실패')))
      .catch((e) => e.name !== 'AbortError' && setErr((e as Error).message))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [cid, period, gender, device, age, count]);

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
  const rootCid = cat?.parents[0]?.cid ?? cid;

  return (
    <>
      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap gap-1.5">
          {SHOP_CATS.map((c) => (
            <Pill strong key={c.id} active={rootCid === c.id} onClick={() => setCid(c.id)}>
              {c.label}
            </Pill>
          ))}
        </div>
        {/* 하위 분야 — 경로 + 다음 단계 */}
        {cat && (cat.parents.length > 0 || cat.children.length > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
            {[...cat.parents, { cid: cat.cid, name: cat.name }].map((p, i, arr) => (
              <span key={p.cid} className="flex items-center gap-1.5">
                <button
                  onClick={() => setCid(p.cid)}
                  className={'font-bold ' + (i === arr.length - 1 ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {p.name}
                </button>
                {(i < arr.length - 1 || cat.children.length > 0) && <span className="text-[color:var(--text-faint)]">›</span>}
              </span>
            ))}
            {cat.children.map((c) => (
              <button
                key={c.cid}
                onClick={() => setCid(c.cid)}
                className="rounded-md px-2 py-0.5 font-semibold text-muted-foreground hover:text-foreground"
                style={{ background: 'var(--chip)' }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1">
            {SHOP_PERIODS.map((p) => (
              <Pill key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
                {p.label}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Pill active={gender === ''} onClick={() => setGender('')}>남녀</Pill>
            <Pill active={gender === 'f'} onClick={() => setGender('f')}>여성</Pill>
            <Pill active={gender === 'm'} onClick={() => setGender('m')}>남성</Pill>
          </div>
          <div className="flex items-center gap-1">
            <Pill active={device === ''} onClick={() => setDevice('')}>전체 기기</Pill>
            <Pill active={device === 'mo'} onClick={() => setDevice('mo')}>모바일</Pill>
            <Pill active={device === 'pc'} onClick={() => setDevice('pc')}>PC</Pill>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-1">
            <Pill active={compare} onClick={() => setAge('all')}>연령대 비교</Pill>
            <Pill active={age === 'total'} onClick={() => setAge('total')}>전 연령</Pill>
            {AGES.map((a) => (
              <Pill key={a} active={age === a} onClick={() => setAge(a)}>
                {a}대
              </Pill>
            ))}
          </div>
          {!compare && (
            <div className="flex items-center gap-1">
              <span className="mr-1 text-[12.5px] font-bold text-[color:var(--text-faint)]">개수</span>
              {[20, 100, 500].map((n) => (
                <Pill key={n} active={count === n} onClick={() => setCount(n)}>
                  {n}위
                </Pill>
              ))}
            </div>
          )}
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
              (compare ? ' · 파란 글씨 = 그 연령대에만 있는 키워드' : count > 100 ? ' · 검색수는 상위 100위까지만' : '')
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
                        <button
                          onClick={() => onAnalyze(it.keyword, cid)}
                          // 칸이 좁아 한 줄로 자르면 '폴로후드...'처럼 못 알아본다 → 두 줄까지
                          className={
                            'line-clamp-2 min-w-0 flex-1 break-all text-left text-[13px] font-bold leading-snug hover:underline ' +
                            (unique ? 'text-brand' : '')
                          }
                          title={`「${it.keyword}」 분석${unique ? ' · 이 연령대에만 있음' : ''}`}
                        >
                          {it.keyword}
                        </button>
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
                <th className="w-[180px] px-2 py-2 text-left">네이버 월간</th>
                <th className="hidden w-[100px] px-2 py-2 text-right sm:table-cell">모바일</th>
                <th className="hidden w-[90px] px-2 py-2 text-right md:table-cell">PC</th>
                <th className="hidden w-[100px] px-2 py-2 text-right md:table-cell">광고 클릭</th>
                <th className="hidden w-[70px] px-4 py-2 text-right lg:table-cell">경쟁</th>
              </tr>
            </thead>
            <tbody>
              {(rows[0]?.items ?? []).map((it) => {
                const clk = it.naver ? (it.naver.pcClk ?? 0) + (it.naver.mobileClk ?? 0) : null;
                return (
                  <tr key={it.keyword} className="group row-hover" style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td className="num px-4 py-2.5 text-[13px] font-bold text-[color:var(--text-faint)]">{it.rank}</td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <a href={naverSearchUrl(it.keyword)} target="_blank" rel="noopener noreferrer" className="font-bold hover:text-brand hover:underline">
                          {it.keyword}
                        </a>
                        <AnalyzeButton q={it.keyword} onAnalyze={(q) => onAnalyze(q, cid)} />
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      {it.rank > 100 && !it.naver ? (
                        <span className="text-[12px] text-[color:var(--text-faint)]">—</span>
                      ) : (
                        <NaverCell v={it.naver} max={maxNaver} enabled={data?.naverEnabled ?? true} />
                      )}
                    </td>
                    <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] sm:table-cell">
                      {it.naver ? nf.format(it.naver.mobile) : '—'}
                    </td>
                    <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] md:table-cell">
                      {it.naver ? nf.format(it.naver.pc) : '—'}
                    </td>
                    <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] md:table-cell">
                      {clk !== null ? short(clk) : '—'}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-[12.5px] text-[color:var(--text-faint)] lg:table-cell">
                      {it.naver?.comp ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
