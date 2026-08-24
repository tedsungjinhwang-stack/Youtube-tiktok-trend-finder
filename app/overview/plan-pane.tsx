'use client';

import { useEffect, useRef, useState } from 'react';
import { kstTodayDate } from '@/lib/kst';

export type PlanId = 'weekly' | 'monthly' | 'yearly';

const PLACEHOLDER: Record<PlanId, string> = {
  weekly: '이번 주에 끝낼 것',
  monthly: '이번 달 목표',
  yearly: '올해 이루고 싶은 것',
};

/** '2026-08-24' → [2026, 8, 24] */
function parts(date: string): [number, number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}

/**
 * 기간 표기. 어느 주/달/해를 적는 칸인지 안 보이면 지난 걸 그대로 두고도 모른다.
 * 주간은 월요일 시작 기준.
 */
function periodLabel(id: PlanId, today: string): string {
  const [y, m, d] = parts(today);
  if (id === 'yearly') return `${y}년`;
  if (id === 'monthly') return `${m}월`;
  const base = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay: 일=0 → 월요일까지 며칠 되감을지
  const back = (base.getUTCDay() + 6) % 7;
  const mon = new Date(base.getTime() - back * 86_400_000);
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  const f = (x: Date) =>
    `${String(x.getUTCMonth() + 1).padStart(2, '0')}.${String(x.getUTCDate()).padStart(2, '0')}`;
  return `${f(mon)} – ${f(sun)}`;
}

/** 저장은 줄 단위. 화면의 불렛 기호는 렌더링일 뿐 내용에 넣지 않는다. */
function toLines(content: string): string[] {
  const lines = content.split('\n');
  return lines.length > 0 ? lines : [''];
}

/**
 * 주간/월간/연간 계획.
 *
 * Todoist 에는 올리지 않고 앱 DB 에만 둔다 (보기용). 저장 버튼 없이 입력이 멈추면
 * 자동 저장한다 — 매번 누르게 하면 안 쓰게 된다.
 * 자유 메모가 아니라 불렛 목록이라 Enter 로 항목이 늘고 빈 줄에서 Backspace 로 지워진다.
 */
export function PlanPane({ id, label }: { id: PlanId; label: string }) {
  const [lines, setLines] = useState<string[]>(['']);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 저장한 마지막 내용 — 같은 값이면 다시 안 보낸다 */
  const savedRef = useRef('');
  /** 다음 렌더에서 포커스를 줄 줄 번호 (Enter/Backspace 직후) */
  const focusRef = useRef<number | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/v1/plans', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const v: string = j.success ? (j.data?.[id] ?? '') : '';
        setLines(toLines(v));
        savedRef.current = v;
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (focusRef.current === null) return;
    inputs.current[focusRef.current]?.focus();
    focusRef.current = null;
  });

  // 화면을 떠날 때 타이머에 걸려 있던 저장이 사라지지 않게 정리
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const save = async (value: string) => {
    if (value === savedRef.current) return;
    setState('saving');
    try {
      const r = await fetch('/api/v1/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: value }),
      });
      const j = await r.json().catch(() => ({ success: false }));
      if (j.success) {
        savedRef.current = value;
        setState('saved');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  const commit = (next: string[]) => {
    setLines(next);
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    // 끝의 빈 줄은 저장하지 않는다 — 다음에 열었을 때 빈 불렛만 쌓인다
    const value = [...next].join('\n').replace(/\n+$/, '');
    timer.current = setTimeout(() => save(value), 700);
  };

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    save(lines.join('\n').replace(/\n+$/, ''));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const next = [...lines];
      next.splice(i + 1, 0, '');
      focusRef.current = i + 1;
      commit(next);
    } else if (e.key === 'Backspace' && lines[i] === '' && lines.length > 1) {
      e.preventDefault();
      const next = lines.filter((_, x) => x !== i);
      focusRef.current = Math.max(0, i - 1);
      commit(next);
    } else if (e.key === 'ArrowDown' && i < lines.length - 1) {
      e.preventDefault();
      inputs.current[i + 1]?.focus();
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      inputs.current[i - 1]?.focus();
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-[13px] font-extrabold tracking-[-0.02em]">{label}</span>
          <span className="num truncate text-[11.5px] font-bold text-brand">
            {periodLabel(id, kstTodayDate())}
          </span>
        </span>
        <span className="shrink-0 text-[11.5px] font-semibold">
          {state === 'saving' && <span className="text-[color:var(--text-faint)]">저장 중…</span>}
          {state === 'saved' && <span className="text-[color:var(--text-faint)]">저장됨</span>}
          {state === 'error' && <span style={{ color: 'var(--red)' }}>저장 실패</span>}
        </span>
      </div>

      <div className="min-h-[132px] flex-1 rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2.5 py-2">
        {loading ? null : (
          <ul>
            {lines.map((line, i) => (
              <li key={i} className="group flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="shrink-0 select-none text-[13px] leading-[1.9] text-[color:var(--text-faint)]"
                >
                  •
                </span>
                <input
                  ref={(el) => {
                    inputs.current[i] = el;
                  }}
                  value={line}
                  onChange={(e) => {
                    const next = [...lines];
                    next[i] = e.target.value;
                    commit(next);
                  }}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onBlur={flush}
                  placeholder={i === 0 ? PLACEHOLDER[id] : ''}
                  spellCheck={false}
                  className="min-w-0 flex-1 border-none bg-transparent py-0.5 text-[13.5px] leading-[1.6] outline-none placeholder:text-[color:var(--text-faint)]"
                />
                {lines.length > 1 && (
                  <button
                    onClick={() => {
                      const next = lines.filter((_, x) => x !== i);
                      commit(next.length ? next : ['']);
                    }}
                    title="이 줄 삭제"
                    className="hover-action shrink-0 text-[12px] text-[color:var(--text-faint)] hover:text-[color:var(--red)]"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!loading && (
          <button
            onClick={() => {
              focusRef.current = lines.length;
              commit([...lines, '']);
            }}
            className="mt-1 pl-[18px] text-[12.5px] font-semibold text-[color:var(--text-faint)] hover:text-foreground"
          >
            + 항목 추가
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 주간·월간·연간 묶음.
 *
 * vertical 이면 좌측 사이드 컬럼용으로 세로로 쌓고, 아니면 한 줄에 셋을 나란히 둔다.
 * 사이드는 넓은 화면에서만 열리므로, 좁아지면 본문 위로 내려와 가로 배치로 돌아간다.
 */
export function PlansCard({ vertical = false }: { vertical?: boolean }) {
  return (
    <section
      className={
        'card-surface theme-fade rounded-[24px] px-[22px] pb-5 pt-[18px] ' +
        (vertical ? '' : 'mb-3')
      }
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">계획</h2>
        <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
          {vertical ? '자동 저장' : '나만 보는 메모 · 자동 저장'}
        </span>
      </div>
      <div className={vertical ? 'flex flex-col gap-4' : 'grid gap-3 md:grid-cols-3'}>
        <PlanPane id="weekly" label="주간" />
        <PlanPane id="monthly" label="월간" />
        <PlanPane id="yearly" label="연간" />
      </div>
    </section>
  );
}
