'use client';

import { useEffect, useRef, useState } from 'react';

export type PlanId = 'weekly' | 'monthly' | 'yearly';

const PLACEHOLDER: Record<PlanId, string> = {
  weekly: '이번 주에 끝낼 것\n\n- ',
  monthly: '이번 달 목표\n\n- ',
  yearly: '올해 이루고 싶은 것\n\n- ',
};

/**
 * 주간/월간/연간 계획 메모.
 *
 * Todoist 에는 올리지 않고 앱 DB 에만 둔다 (보기용). 저장 버튼을 따로 두지 않고
 * 입력이 멈추면 자동 저장한다 — 매번 누르게 하면 안 쓰게 된다.
 */
export function PlanPane({ id, label }: { id: PlanId; label: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 저장한 마지막 내용 — 같은 값이면 다시 안 보낸다 */
  const savedRef = useRef('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch('/api/v1/plans', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const v = j.success ? (j.data?.[id] ?? '') : '';
        setText(v);
        savedRef.current = v;
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  // 탭을 옮기거나 화면을 떠날 때 타이머에 걸려 있던 저장이 사라지지 않게 정리
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

  const onChange = (v: string) => {
    setText(v);
    setState('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(v), 700);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-extrabold tracking-[-0.02em]">{label}</span>
        <span className="text-[11.5px] font-semibold">
          {state === 'saving' && <span className="text-[color:var(--text-faint)]">저장 중…</span>}
          {state === 'saved' && <span className="text-[color:var(--text-faint)]">저장됨</span>}
          {state === 'error' && <span style={{ color: 'var(--red)' }}>저장 실패</span>}
        </span>
      </div>
      <textarea
        value={loading ? '' : text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          save(text);
        }}
        placeholder={loading ? '' : PLACEHOLDER[id]}
        spellCheck={false}
        className="min-h-[132px] w-full flex-1 resize-y rounded-[10px] border border-input bg-[color:var(--surface-input)] px-3 py-2.5 text-[13.5px] leading-[1.7] outline-none focus:border-[color:var(--accent-solid)]"
      />
    </div>
  );
}

/** 주간·월간·연간을 한 줄에 나란히. 좁은 화면에서는 쌓인다. */
export function PlansCard() {
  return (
    <section className="card-surface theme-fade mb-3 rounded-[24px] px-[22px] pb-5 pt-[18px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">계획</h2>
        <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
          나만 보는 메모 · 자동 저장
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <PlanPane id="weekly" label="주간" />
        <PlanPane id="monthly" label="월간" />
        <PlanPane id="yearly" label="연간" />
      </div>
    </section>
  );
}
