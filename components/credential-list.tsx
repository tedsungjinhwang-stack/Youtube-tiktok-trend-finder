'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type CredStatus = {
  service: string;
  label: string;
  description: string;
  editable: boolean;
  bootOnly: boolean;
  isSet: boolean;
  source: 'db' | 'memory' | 'env' | 'none';
  preview: string | null;
};

export function CredentialList() {
  const [items, setItems] = useState<CredStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const r = await fetch('/api/v1/credentials');
    const j = await r.json();
    setItems(j.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading && items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-[12.5px] text-muted-foreground">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <ul className="divide-y divide-border/60">
        {items.map((c) => (
          <Row
            key={c.service}
            cred={c}
            isEditing={editing === c.service}
            onStartEdit={() => setEditing(c.service)}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await refresh();
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function Row({
  cred,
  isEditing,
  onStartEdit,
  onCancel,
  onSaved,
}: {
  cred: CredStatus;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    const r = await fetch('/api/v1/credentials', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: cred.service, value: value.trim() }),
    });
    const j = await r.json();
    setSaving(false);
    if (!j.success) {
      setError(j.error?.message ?? '저장 실패');
      return;
    }
    setValue('');
    onSaved();
  };

  const clear = async () => {
    if (!confirm(`${cred.label} 값을 지울까요? (env로 폴백)`)) return;
    setSaving(true);
    await fetch(`/api/v1/credentials/${cred.service}`, { method: 'DELETE' });
    setSaving(false);
    onSaved();
  };

  return (
    <li className="px-4 py-3 text-[13px]">
      <div className="flex items-center gap-3">
        <StatusDot isSet={cred.isSet} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{cred.label}</span>
            <code className="rounded border border-border/60 bg-background/40 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
              {cred.service}
            </code>
            <SourceBadge source={cred.source} />
            {cred.bootOnly && <BootOnlyBadge />}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {cred.description}
          </div>
        </div>

        <span className="num shrink-0 text-[11.5px] text-muted-foreground">
          {cred.preview ?? '(미설정)'}
        </span>

        {cred.editable && !isEditing && (
          <div className="flex gap-1">
            <button
              onClick={onStartEdit}
              className="rounded border border-border/60 bg-background/40 px-2 py-1 text-[11px] hover:border-foreground/40"
            >
              수정
            </button>
            {(cred.source === 'memory' || cred.source === 'db') && (
              <button
                onClick={clear}
                disabled={saving}
                className="rounded border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
              >
                지우기
              </button>
            )}
          </div>
        )}
      </div>

      {isEditing && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`${cred.label} 값 붙여넣기`}
            className="rounded-md border bg-background/40 px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') onCancel();
            }}
          />
          <button
            onClick={save}
            disabled={saving || !value.trim()}
            className={cn(
              'rounded-md px-3 py-2 text-[13px] font-semibold',
              saving || !value.trim()
                ? 'bg-secondary text-muted-foreground'
                : 'bg-brand text-brand-foreground hover:bg-brand/90'
            )}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border bg-background/40 px-3 py-2 text-[13px] hover:border-foreground/40"
          >
            취소
          </button>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">
          {error}
        </div>
      )}
    </li>
  );
}

function StatusDot({ isSet }: { isSet: boolean }) {
  return (
    <span
      className={cn(
        'grid h-6 w-6 place-items-center rounded-full text-[11px]',
        isSet
          ? 'bg-success/20 text-success'
          : 'bg-destructive/20 text-destructive'
      )}
    >
      {isSet ? '✓' : '×'}
    </span>
  );
}

function SourceBadge({ source }: { source: CredStatus['source'] }) {
  if (source === 'none') return null;
  const map = {
    db: { label: 'DB', cls: 'border-success/40 text-success' },
    memory: { label: '메모리', cls: 'border-warning/40 text-warning' },
    env: { label: '.env', cls: 'border-border/60 text-muted-foreground' },
  } as const;
  const m = map[source];
  return (
    <span className={cn('rounded border px-1.5 py-0.5 text-[9.5px]', m.cls)}>
      {m.label}
    </span>
  );
}

function BootOnlyBadge() {
  return (
    <span className="rounded border border-border/60 bg-background/40 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
      env 전용
    </span>
  );
}
