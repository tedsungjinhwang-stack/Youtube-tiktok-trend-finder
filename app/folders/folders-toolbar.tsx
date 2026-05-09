'use client';

import { useState, useTransition } from 'react';
import { createFolderAction } from './actions';

export function FoldersToolbar() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null
  );
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const r = await createFolderAction(name);
      if (!r.ok) {
        setMsg({ kind: 'err', text: r.error });
      } else {
        setMsg({ kind: 'ok', text: `'${r.data.name}' 추가됨` });
        setName('');
        setAdding(false);
      }
    });
  };

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
        <button
          onClick={() => {
            setAdding((v) => !v);
            setMsg(null);
          }}
          className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-foreground hover:bg-brand/90"
        >
          {adding ? '취소' : '+ 새 폴더'}
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

      {adding && (
        <form
          onSubmit={onCreate}
          className="flex gap-2 rounded-xl border bg-card p-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="폴더 이름 (예: 쇼츠 모음)"
            maxLength={50}
            disabled={isPending}
            className="flex-1 rounded-md border bg-background/40 px-3 py-2 text-[14px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !name.trim()}
            className="rounded-md bg-foreground px-3 py-2 text-[14px] font-semibold text-background hover:opacity-90 disabled:opacity-40"
          >
            {isPending ? '추가 중…' : '추가'}
          </button>
        </form>
      )}
    </div>
  );
}
