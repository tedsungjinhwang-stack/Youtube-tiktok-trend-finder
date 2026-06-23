'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

type Folder = { id: string; name: string };
type StockItem = {
  id: string;
  folderId: string;
  url: string;
  title: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  folder?: { id: string; name: string };
};

export function StockClient({ folders }: { folders: Folder[] }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // 추가 폼
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newFolderId, setNewFolderId] = useState<string>('');

  // 마지막 폴더 기억
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = localStorage.getItem('stock-last-folder');
    if (last && folders.some((f) => f.id === last)) setNewFolderId(last);
    else if (folders[0]) setNewFolderId(folders[0].id);
  }, [folders]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/stock-materials', { cache: 'no-store' });
      const j = await r.json();
      if (j.success) setItems(j.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(
    () =>
      activeFolderId === 'all'
        ? items
        : items.filter((x) => x.folderId === activeFolderId),
    [items, activeFolderId]
  );

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.folderId, (m.get(it.folderId) ?? 0) + 1);
    return m;
  }, [items]);

  const add = async () => {
    if (!newUrl.trim() || !newFolderId) return;
    setBusy(true);
    try {
      const r = await fetch('/api/v1/stock-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: newFolderId,
          url: newUrl.trim(),
          title: newTitle,
          description: newDescription,
        }),
      });
      const j = await r.json();
      if (j.success) {
        localStorage.setItem('stock-last-folder', newFolderId);
        setNewUrl('');
        setNewTitle('');
        setNewDescription('');
        refresh();
      } else alert(j.error?.message ?? '실패');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('이 소재를 삭제할까요?')) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
    await fetch(`/api/v1/stock-materials/${id}`, { method: 'DELETE' }).catch(() => {});
  };

  const update = async (id: string, patch: Partial<StockItem>) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await fetch(`/api/v1/stock-materials/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  if (folders.length === 0) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
        폴더가 없습니다.{' '}
        <a href="/folders" className="underline">
          폴더 관리
        </a>
        에서 먼저 폴더를 만드세요.
      </div>
    );
  }

  return (
    <>
      {/* 폴더 탭 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border bg-card/40 p-2">
        <button
          onClick={() => setActiveFolderId('all')}
          className={cn(
            'rounded-full px-3 py-1 text-[12.5px] font-medium',
            activeFolderId === 'all'
              ? 'bg-foreground text-background'
              : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
          )}
        >
          전체 <span className="num ml-1 text-[13px] opacity-70">({items.length})</span>
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFolderId(f.id)}
            className={cn(
              'rounded-full px-3 py-1 text-[12.5px] font-medium',
              activeFolderId === f.id
                ? 'bg-foreground text-background'
                : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {f.name}
            <span className="num ml-1 text-[13px] opacity-70">
              ({counts.get(f.id) ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* 추가 폼 */}
      <div className="mb-4 rounded-xl border bg-card p-3">
        <div className="mb-2 text-[12px] font-bold text-muted-foreground">
          + 소재 추가
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_120px]">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="URL"
            inputMode="url"
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
          <select
            value={newFolderId}
            onChange={(e) => setNewFolderId(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            onClick={add}
            disabled={busy || !newUrl.trim() || !newFolderId}
            className="h-9 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {busy ? '추가 중…' : '+ 추가'}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr]">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="제목 (선택)"
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="간단한 설명 (선택)"
            className="h-9 rounded-md border bg-background px-3 text-sm"
          />
        </div>
      </div>

      {/* 리스트 */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          로딩 중…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          저장된 소재 없음
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((it) => (
            <StockCard key={it.id} item={it} folders={folders} onUpdate={update} onRemove={remove} />
          ))}
        </ul>
      )}
    </>
  );
}

function StockCard({
  item,
  folders,
  onUpdate,
  onRemove,
}: {
  item: StockItem;
  folders: Folder[];
  onUpdate: (id: string, patch: Partial<StockItem>) => void;
  onRemove: (id: string) => void;
}) {
  const folderName =
    folders.find((f) => f.id === item.folderId)?.name ?? '?';
  const isUrl = /^https?:\/\//i.test(item.url);

  return (
    <li className="space-y-2 rounded-xl border bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <select
          value={item.folderId}
          onChange={(e) => onUpdate(item.id, { folderId: e.target.value })}
          className="h-6 rounded border bg-background px-1.5 text-[12px] font-semibold text-muted-foreground"
          title="폴더 변경"
        >
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => onRemove(item.id)}
          className="grid h-6 w-6 place-items-center rounded text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="삭제"
        >
          ✕
        </button>
      </div>

      <InlineText
        value={item.title}
        placeholder="제목"
        className="text-[13.5px] font-semibold"
        onSave={(v) => onUpdate(item.id, { title: v })}
      />

      {isUrl ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-[13px] text-blue-600 hover:underline dark:text-blue-400"
          title={item.url}
        >
          {item.url}
        </a>
      ) : (
        <span className="block truncate text-[13px]" title={item.url}>
          {item.url}
        </span>
      )}

      <InlineText
        value={item.description}
        placeholder="간단한 설명"
        className="text-[12px] text-muted-foreground"
        multiline
        onSave={(v) => onUpdate(item.id, { description: v })}
      />

      <div className="text-[12px] text-muted-foreground/60">
        {new Date(item.createdAt).toLocaleDateString('ko-KR')} · {folderName}
      </div>
    </li>
  );
}

function InlineText({
  value,
  placeholder,
  className,
  multiline,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  className?: string;
  multiline?: boolean;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if ((value ?? '') !== v) onSave(v || null);
  };

  if (editing) {
    return multiline ? (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
          else if (e.key === 'Escape') setEditing(false);
        }}
        rows={2}
        placeholder={placeholder}
        className={cn(
          'w-full rounded border bg-background px-2 py-1 text-[12px]',
          className
        )}
      />
    ) : (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setEditing(false);
        }}
        placeholder={placeholder}
        className={cn(
          'w-full rounded border bg-background px-2 py-1 text-sm',
          className
        )}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={cn(
        'cursor-text rounded px-1 py-0.5 hover:bg-accent/40',
        className
      )}
    >
      {value || <span className="text-muted-foreground/60">{placeholder}</span>}
    </div>
  );
}
