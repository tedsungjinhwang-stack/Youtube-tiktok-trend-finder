'use client';

import { useState, useTransition } from 'react';
import { reseedFoldersAction } from './actions';

export function FoldersToolbar() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  );

  const onReseed = () => {
    setMsg(null);
    startTransition(async () => {
      const r = await reseedFoldersAction();
      if (!r.ok) {
        setMsg({ kind: 'err', text: r.error });
      } else {
        setMsg({
          kind: 'ok',
          text: `완료 — 신규 ${r.data.created} · 정렬 갱신 ${r.data.updated}`,
        });
      }
    });
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[13.5px]">
      <button
        disabled
        title="(준비 중)"
        className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-foreground opacity-50"
      >
        + 새 폴더
      </button>
      <button
        onClick={onReseed}
        disabled={isPending}
        className="rounded-lg border bg-card px-3 py-1.5 hover:border-foreground/40 disabled:opacity-50"
      >
        {isPending ? '불러오는 중…' : '시드 다시 불러오기'}
      </button>
      {msg && (
        <span
          className={
            msg.kind === 'ok'
              ? 'text-[12px] text-success'
              : 'text-[12px] text-warning'
          }
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
