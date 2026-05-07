'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setAutoScrapeAction } from './actions';

export function AutoScrapeToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const r = await setAutoScrapeAction(next);
      if (!r.ok) {
        setError(r.error);
        setEnabled(!next);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={isPending}
        className={`relative h-6 w-11 rounded-full border transition disabled:opacity-50 ${
          enabled ? 'bg-success border-success' : 'bg-secondary border-border'
        }`}
        aria-pressed={enabled}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${
            enabled ? 'left-[1.375rem]' : 'left-0.5'
          }`}
        />
      </button>
      <span className="text-[13px] text-muted-foreground">
        {enabled ? 'ON' : 'OFF'}
      </span>
      {error && <span className="text-[12px] text-warning">{error}</span>}
    </div>
  );
}
