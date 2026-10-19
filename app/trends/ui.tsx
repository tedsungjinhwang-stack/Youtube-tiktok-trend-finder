'use client';

/**
 * 트렌드 탭 공용 조각.
 *
 * 그래프 색 규칙: 한 그래프 = 한 키워드라 범례 없이 한 색(--accent-solid)만 쓴다.
 * 오르내림은 빨강/초록으로 구분하지 않는다 — 색약 검사(validate_palette)에서 두 색이 구분 안 됐다.
 * 대신 +/− 부호가 붙은 숫자와 막대 방향(가운데 0 기준 좌우)으로 읽게 한다.
 */
import { useMemo, useRef, useState } from 'react';

export type Naver = {
  pc: number;
  mobile: number;
  total: number;
  comp: string | null;
  pcClk?: number | null;
  mobileClk?: number | null;
  pcCtr?: number | null;
  mobileCtr?: number | null;
  adDepth?: number | null;
} | null;

export const nf = new Intl.NumberFormat('ko-KR');

/** 98000 → '9.8만', 1200000 → '120만' */
export function short(n: number): string {
  if (n >= 100_000_000) return `${Math.round(n / 100_000_000)}억`;
  if (n >= 100_000) return `${Math.round(n / 10_000)}만`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}만`;
  return nf.format(Math.round(n));
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 60) return `${Math.max(m, 1)}분 전`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

export function naverSearchUrl(q: string) {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(q)}`;
}

export function Pill({
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
export function NaverCell({ v, max, enabled }: { v: Naver; max: number; enabled: boolean }) {
  if (!enabled) return <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">키 필요</span>;
  if (!v) return <span className="text-[12px] text-[color:var(--text-faint)]">—</span>;
  const pct = max > 0 ? Math.max(4, Math.round((v.total / max) * 100)) : 0;
  return (
    <span className="flex min-w-0 items-center gap-2" title={`PC ${nf.format(v.pc)} · 모바일 ${nf.format(v.mobile)}`}>
      <span className="hidden h-[6px] w-[64px] shrink-0 overflow-hidden rounded-full sm:block" style={{ background: 'var(--chip)' }}>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--accent-solid)' }} />
      </span>
      <span className="num text-[13px] font-bold">{v.total <= 10 ? '<10' : short(v.total)}</span>
    </span>
  );
}

export function StatusLine({
  loading,
  err,
  fetchedAt,
  note,
}: {
  loading: boolean;
  err: string | null;
  fetchedAt?: string | null;
  note?: string;
}) {
  if (err) return <div className="surface-warn mb-3 rounded-xl border px-4 py-3 text-[13px] font-semibold">{err}</div>;
  return (
    <p className="mb-2 px-1 text-[12px] font-semibold text-[color:var(--text-faint)]">
      {loading ? '불러오는 중… (처음엔 네이버 검색수까지 붙이느라 10초쯤 걸릴 수 있습니다)' : note}
      {!loading && fetchedAt && <> · {ago(fetchedAt)} 기준</>}
    </p>
  );
}

/** 키워드 옆 '분석' 버튼 — 키워드 분석 칸으로 넘긴다 */
export function AnalyzeButton({ q, onAnalyze }: { q: string; onAnalyze?: (q: string) => void }) {
  if (!onAnalyze) return null;
  return (
    <button
      onClick={() => onAnalyze(q)}
      title={`「${q}」 키워드 분석`}
      className="hover-action shrink-0 rounded-md border border-input px-1.5 py-px text-[11px] font-bold text-muted-foreground hover:border-[color:var(--border-hover)] hover:text-foreground"
    >
      분석
    </button>
  );
}

export function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
      <div className="flex items-center justify-between gap-3 px-[22px] pt-4">
        <h3 className="text-[14px] font-extrabold">{title}</h3>
        {aside && <span className="text-right text-[12px] font-semibold text-[color:var(--text-faint)]">{aside}</span>}
      </div>
      <div className="px-[22px] pb-5 pt-3">{children}</div>
    </section>
  );
}

/**
 * 한 줄 추이 그래프 (0~100 상대값). 십자선 + 툴팁.
 * recharts 를 안 쓰는 이유: SVG 속성엔 CSS 변수가 안 먹어서 테마 색을 못 따라간다.
 */
export function TrendLine({
  points,
  height = 160,
  label = '관심도',
  dateFmt = (d: string) => d.slice(5, 10).replace('-', '.'),
}: {
  points: { date: string; value: number }[];
  height?: number;
  label?: string;
  dateFmt?: (d: string) => string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padL = 30;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const d = useMemo(
    () => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, max, H]
  );
  if (points.length === 0) return <p className="py-6 text-center text-[13px] text-[color:var(--text-faint)]">데이터 없음</p>;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`${label} 추이`}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(max * t)} y2={y(max * t)} style={{ stroke: 'var(--line)' }} strokeWidth={1} />
            <text x={padL - 6} y={y(max * t) + 4} textAnchor="end" fontSize={10} style={{ fill: 'var(--text-faint)' }}>
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        {ticks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            fontSize={10}
            style={{ fill: 'var(--text-faint)' }}
          >
            {dateFmt(points[i].date)}
          </text>
        ))}
        <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: 'var(--accent-solid)' }} />
        {h && hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} style={{ stroke: 'var(--text-faint)' }} strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.value)} r={4.5} strokeWidth={2} style={{ fill: 'var(--accent-solid)', stroke: 'var(--panel)' }} />
          </>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg px-2 py-1 text-[12px] font-bold shadow"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})`,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
          }}
        >
          <span className="text-[color:var(--text-faint)]">{dateFmt(h.date)}</span> {label} <span className="num">{Math.round(h.value)}</span>
        </div>
      )}
    </div>
  );
}

/** 가로 막대 목록 (비율·지역 등). 값은 텍스트로도 찍어서 색에 기대지 않는다 */
export function BarList({
  rows,
  fmt = (v: number) => String(Math.round(v)),
}: {
  rows: { label: string; value: number; note?: string }[];
  fmt?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[72px_minmax(0,1fr)_64px] items-center gap-2 text-[13px]">
          <span className="truncate font-semibold text-muted-foreground" title={r.label}>
            {r.label}
          </span>
          <span className="h-[8px] overflow-hidden rounded-full" style={{ background: 'var(--chip)' }}>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: 'var(--accent-solid)' }}
            />
          </span>
          <span className="num text-right font-bold">{r.note ?? fmt(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** 상승률 막대 — 가운데 0 기준으로 오른쪽(+)·왼쪽(−). 색이 아니라 방향과 부호로 읽는다 */
export function GrowthBars({ rows }: { rows: { label: string; growth: number | null }[] }) {
  const cap = Math.max(20, ...rows.map((r) => Math.abs(r.growth ?? 0)));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const g = r.growth;
        const w = g === null ? 0 : Math.min(50, (Math.abs(g) / cap) * 50);
        return (
          <li key={r.label} className="grid grid-cols-[56px_minmax(0,1fr)_64px] items-center gap-2 text-[13px]">
            <span className="font-semibold text-muted-foreground">{r.label}</span>
            <span className="relative h-[8px] rounded-full" style={{ background: 'var(--chip)' }}>
              <span className="absolute left-1/2 top-[-3px] h-[14px] w-px" style={{ background: 'var(--text-faint)' }} />
              {g !== null && g !== 0 && (
                <span
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    width: `${w}%`,
                    left: g > 0 ? '50%' : `${50 - w}%`,
                    background: g > 0 ? 'var(--accent-solid)' : 'var(--text-faint)',
                  }}
                />
              )}
            </span>
            <span className="num text-right font-bold">
              {g === null ? <span className="text-[color:var(--text-faint)]">새로 생김</span> : `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(g)}%`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 키가 없을 때 칸 자리에 보여주는 안내 */
export function NeedKey({ what, how }: { what: string; how: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3 text-[13px] leading-relaxed text-muted-foreground" style={{ background: 'var(--subtle)' }}>
      <b className="text-foreground">{what}</b>
      <br />
      {how}
    </div>
  );
}
