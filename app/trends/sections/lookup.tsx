'use client';

import { useState } from 'react';
import { AnalyzeButton, NaverCell, nf, naverSearchUrl, short, type Naver } from '../ui';

/** 여러 키워드의 네이버 최근 30일 검색수를 한 번에 비교 */
export function LookupSection({ onAnalyze }: { onAnalyze: (q: string) => void }) {
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
                <th className="w-[190px] px-2 py-2 text-left">네이버 월간</th>
                <th className="hidden w-[100px] px-2 py-2 text-right sm:table-cell">모바일</th>
                <th className="hidden w-[90px] px-2 py-2 text-right sm:table-cell">PC</th>
                <th className="hidden w-[100px] px-2 py-2 text-right md:table-cell">광고 클릭</th>
                <th className="hidden w-[70px] px-[22px] py-2 text-right md:table-cell">경쟁</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.keyword} className="group row-hover" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <td className="px-[22px] py-2.5">
                    <span className="flex items-center gap-2">
                      <a href={naverSearchUrl(r.keyword)} target="_blank" rel="noopener noreferrer" className="font-bold hover:text-brand hover:underline">
                        {r.keyword}
                      </a>
                      <AnalyzeButton q={r.keyword} onAnalyze={onAnalyze} />
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    {r.naver || !enabled ? (
                      <NaverCell v={r.naver} max={max} enabled={enabled} />
                    ) : (
                      <span className="text-[12px] text-[color:var(--text-faint)]">네이버 데이터 없음</span>
                    )}
                  </td>
                  <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] sm:table-cell">
                    {r.naver ? nf.format(r.naver.mobile) : '—'}
                  </td>
                  <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] sm:table-cell">
                    {r.naver ? nf.format(r.naver.pc) : '—'}
                  </td>
                  <td className="num hidden px-2 py-2.5 text-right text-[13px] text-[color:var(--text-faint)] md:table-cell">
                    {r.naver ? short((r.naver.pcClk ?? 0) + (r.naver.mobileClk ?? 0)) : '—'}
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
