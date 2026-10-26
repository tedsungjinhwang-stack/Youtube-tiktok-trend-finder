'use client';

import { useState } from 'react';
import { ago, short } from '../../trends/ui';
import type { CollectStatus } from '@/lib/radar/queries';

export { ago, short };

export function Chip({ children, tone = 'plain', title }: { children: React.ReactNode; tone?: 'plain' | 'amber' | 'green' | 'red' | 'brand'; title?: string }) {
  const style =
    tone === 'amber'
      ? { background: 'var(--amber-bg)', color: 'var(--amber)' }
      : tone === 'green'
        ? { background: 'var(--green-bg)', color: 'var(--green)' }
        : tone === 'red'
          ? { background: 'var(--red-bg)', color: 'var(--red)' }
          : tone === 'brand'
            ? { background: 'var(--accent-solid)', color: 'var(--on-accent, #fff)' }
            : { background: 'var(--chip)', color: 'var(--text-quaternary)' };
  return (
    <span title={title} className="inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[11.5px] font-bold" style={style}>
      {children}
    </span>
  );
}

export const FORMAT_LABEL: Record<string, string> = { shorts: '숏폼', long: '롱폼', hybrid: '숏폼+롱폼' };

/**
 * 유튜브 썸네일 주소 — 큰 것부터. 없는 크기면(404) 다음 것으로 넘어간다.
 *  쇼츠: oardefault(세로 원본, 약 1080×1920) → hq720(1280×720) → hqdefault(480×360)
 *  롱폼: hq720 → hqdefault
 *  작은 칸(sm): mqdefault(320×180) 로 충분
 */
function thumbCandidates(id: string, vertical: boolean | undefined, size: 'sm' | 'lg', stored: string | null): string[] {
  const base = `https://i.ytimg.com/vi/${id}`;
  const list =
    size === 'sm'
      ? [`${base}/mqdefault.jpg`]
      : vertical
        ? [`${base}/oardefault.jpg`, `${base}/hq720.jpg`, `${base}/hqdefault.jpg`]
        : [`${base}/hq720.jpg`, `${base}/hqdefault.jpg`];
  if (stored) list.push(stored);
  return list;
}

/** 영상 썸네일 — 쇼츠는 9:16 칸에 세로 원본 썸네일 */
export function VideoThumb({
  id,
  src,
  vertical,
  size = 'lg',
  className = '',
  children,
}: {
  id: string;
  src: string | null;
  vertical?: boolean;
  size?: 'sm' | 'lg';
  className?: string;
  children?: React.ReactNode;
}) {
  const candidates = thumbCandidates(id, vertical, size, src);
  const [i, setI] = useState(0);
  return (
    <a
      href={vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={'relative block shrink-0 overflow-hidden rounded-lg ' + className}
      style={{ aspectRatio: vertical ? '9 / 16' : '16 / 9', background: 'var(--chip)' }}
    >
      {i < candidates.length && (
        // eslint-disable-next-line @next/next/no-img-element -- 유튜브 썸네일
        <img
          src={candidates[i]}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setI(i + 1)}
          // 유튜브는 없는 크기에 120×90 회색 그림을 200 으로 줄 때가 있다 — 너무 작으면 다음 것으로
          onLoad={(e) => {
            if (size === 'lg' && e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth <= 120) setI(i + 1);
          }}
        />
      )}
      {children}
    </a>
  );
}

/** 최근 며칠 하루 조회수 막대 — 한 색, 마지막 날만 진하게 */
export function Spark({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">기록 쌓는 중</span>;
  }
  const max = Math.max(...values, 1);
  const w = 8;
  const gap = 3;
  const hgt = 28;
  return (
    <svg width={values.length * (w + gap) - gap} height={hgt} role="img" aria-label={`최근 ${values.length}일 하루 조회수`}>
      {values.map((v, i) => {
        const h = Math.max(2, Math.round((v / max) * hgt));
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={hgt - h}
            width={w}
            height={h}
            rx={2}
            style={{ fill: 'var(--accent-solid)', opacity: i === values.length - 1 ? 1 : 0.38 }}
          >
            <title>{short(v)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** 수집 상태 한 줄 */
export function StatusLine({ s }: { s: CollectStatus }) {
  return (
    <p className="text-[12px] font-semibold text-[color:var(--text-faint)]">
      관심 목록 채널 <span className="num">{s.watchedChannels.toLocaleString('ko-KR')}</span>곳 · 최근 7일 영상{' '}
      <span className="num">{s.trackedVideos.toLocaleString('ko-KR')}</span>개 추적 ·{' '}
      {s.lastRunAt ? `마지막 수집 ${ago(s.lastRunAt)}` : '아직 수집 전'}
      {s.quotaLeft != null && (
        <>
          {' '}
          · 오늘 남은 유튜브 할당량 <span className="num">{s.quotaLeft.toLocaleString('ko-KR')}</span>
        </>
      )}
      {s.stoppedBy === 'quota' && ' · 할당량이 모자라 일부만 수집'}
    </p>
  );
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="theme-fade inline-flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-bold"
      style={{ background: 'var(--chip)', color: on ? 'hsl(var(--foreground))' : 'var(--text-quaternary)' }}
    >
      <span
        className="grid h-3.5 w-3.5 place-items-center rounded-[4px] text-[10px] leading-none"
        style={on ? { background: 'var(--accent-solid)', color: 'var(--on-accent, #fff)' } : { border: '1.5px solid var(--text-faint)' }}
      >
        {on ? '✓' : ''}
      </span>
      {children}
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-surface theme-fade rounded-[22px] px-6 py-12 text-center text-[14px] font-semibold leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

/** 2년 8개월차 */
export function channelAge(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const months = (new Date().getFullYear() - d.getFullYear()) * 12 + (new Date().getMonth() - d.getMonth());
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y}년 ${m}개월차` : `${Math.max(m, 0)}개월차`;
}
