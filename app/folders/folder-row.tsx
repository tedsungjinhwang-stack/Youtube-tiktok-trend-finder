'use client';

import { useState, useTransition } from 'react';
import { deleteFolderAction, renameFolderAction } from './actions';

type Props = {
  id: string;
  name: string;
  channelCount: number;
  index: number;
  isSeed: boolean;
};

export function FolderRow({ id, name, channelCount, index, isSeed }: Props) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);

  const onSaveRename = () => {
    setError(null);
    if (isSeed) {
      setError('DB 미연결 상태 — 시드 미리보기는 수정 불가');
      return;
    }
    if (draft.trim() === name) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const r = await renameFolderAction(id, draft);
      if (!r.ok) setError(r.error);
      else setEditing(false);
    });
  };

  const onCancelRename = () => {
    setDraft(name);
    setEditing(false);
    setError(null);
  };

  const onDelete = () => {
    setError(null);
    if (isSeed) {
      setError('DB 미연결 상태 — 시드 미리보기는 삭제 불가');
      return;
    }
    if (!confirm(`'${name}' 폴더를 삭제할까요?`)) return;
    startTransition(async () => {
      const r = await deleteFolderAction(id);
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
      <span className="num w-6 text-[12.5px] tabular-nums text-muted-foreground">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="text-muted-foreground/40">⋮⋮</span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          maxLength={50}
          disabled={isPending}
          className="flex-1 rounded-md border bg-background/40 px-2 py-1 text-[14px] outline-none focus:border-foreground/40 disabled:opacity-50"
        />
      ) : (
        <span className="flex-1 text-[14.5px] font-medium">{name}</span>
      )}

      <span className="num text-[12.5px] text-muted-foreground">
        ({channelCount})
      </span>

      {error && (
        <span className="max-w-[200px] truncate text-[11.5px] text-warning" title={error}>
          {error}
        </span>
      )}

      {editing ? (
        <>
          <button
            onClick={onSaveRename}
            disabled={isPending || !draft.trim()}
            className="rounded px-2 py-1 text-[12px] text-success hover:bg-success/10 disabled:opacity-40"
          >
            저장
          </button>
          <button
            onClick={onCancelRename}
            disabled={isPending}
            className="rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            취소
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setEditing(true)}
            disabled={isPending}
            className="rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            이름 변경
          </button>
          <button
            onClick={onDelete}
            disabled={isPending}
            className="rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-40"
          >
            삭제
          </button>
        </>
      )}
    </li>
  );
}
