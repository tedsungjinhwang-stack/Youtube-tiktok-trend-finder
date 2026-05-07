'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const COOKIE_KEY_MIN_VIEWS = 'tf_default_min_views';
const MAX_AGE = 60 * 60 * 24 * 365;

export function ThresholdsForm({
  initial,
}: {
  initial: { minViews: number };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [minViews, setMinViews] = useState(initial.minViews);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty = minViews !== initial.minViews;

  const save = () => {
    document.cookie = `${COOKIE_KEY_MIN_VIEWS}=${minViews}; path=/; max-age=${MAX_AGE}`;
    setSavedAt(new Date());
    startTransition(() => router.refresh());
  };

  const reset = () => {
    document.cookie = `${COOKIE_KEY_MIN_VIEWS}=; path=/; max-age=0`;
    setMinViews(50_000);
    setSavedAt(new Date());
    startTransition(() => router.refresh());
  };

  return (
    <div className="space-y-3">
      <Field label="최소 조회수" hint="이 절대 조회수 이하 영상은 제외.">
        <input
          type="number"
          step={10000}
          min={0}
          value={minViews}
          onChange={(e) => setMinViews(Number(e.target.value))}
          className="num w-32 rounded-md border bg-background px-2 py-1 text-right tabular-nums"
        />
      </Field>

      <div className="flex items-center gap-2 pt-1 text-[13px]">
        <button
          onClick={save}
          disabled={!dirty || isPending}
          className="rounded-md bg-foreground px-3 py-1.5 font-semibold text-background disabled:opacity-40"
        >
          저장
        </button>
        <button
          onClick={reset}
          disabled={isPending}
          className="rounded-md border px-3 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          기본값으로
        </button>
        {savedAt && !dirty && (
          <span className="text-[12px] text-success">저장됨</span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="text-[13.5px] font-medium">{label}</div>
        {hint && (
          <div className="mt-0.5 text-[12px] text-muted-foreground">{hint}</div>
        )}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
