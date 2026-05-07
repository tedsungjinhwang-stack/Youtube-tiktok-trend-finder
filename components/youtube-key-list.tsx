'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type KeyRow = {
  id: string;
  label: string;
  preview: string;
  used: number;
  limit: number;
  status: 'active' | 'exhausted';
  source: 'db' | 'env';
};

export function YoutubeKeyList() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/youtube/keys');
      const j = await r.json();
      setKeys(j.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const total = keys.reduce((s, k) => s + k.used, 0);
  const totalLimit = keys.reduce((s, k) => s + k.limit, 0) || 1;

  const submit = async () => {
    if (!label.trim() || !apiKey.trim()) return;
    setSaving(true);
    setError(null);
    const r = await fetch('/api/v1/youtube/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: label.trim(), apiKey: apiKey.trim() }),
    });
    const j = await r.json();
    setSaving(false);
    if (!j.success) {
      setError(j.error?.message ?? '추가 실패');
      return;
    }
    setLabel('');
    setApiKey('');
    setAdding(false);
    await refresh();
  };

  const remove = async (k: KeyRow) => {
    if (k.source === 'env') {
      alert('env 키는 .env 파일에서 직접 제거하세요.');
      return;
    }
    if (!confirm(`${k.label} 키를 삭제할까요?`)) return;
    await fetch(`/api/v1/youtube/keys/${k.id}`, { method: 'DELETE' });
    await refresh();
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">YouTube Data API</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            quota 소진 시 자동 로테이션. PT 자정(KST 17:00) 자동 리셋.
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg bg-brand px-3 py-1.5 text-[13.5px] font-semibold text-brand-foreground hover:bg-brand/90"
        >
          {adding ? '취소' : '+ 키 추가'}
        </button>
      </div>

      {adding && (
        <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[160px_1fr_auto]">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="라벨 (예: 메인1)"
            className="rounded-md border bg-background/40 px-3 py-2 text-[14px] outline-none focus:border-foreground/40"
          />
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza... (Google Cloud API 키)"
            className="rounded-md border bg-background/40 px-3 py-2 text-[14px] outline-none focus:border-foreground/40"
          />
          <button
            onClick={submit}
            disabled={saving || !label.trim() || !apiKey.trim()}
            className={cn(
              'rounded-md px-3 py-2 text-[14px] font-semibold',
              saving || !label.trim() || !apiKey.trim()
                ? 'bg-secondary text-muted-foreground'
                : 'bg-brand text-brand-foreground hover:bg-brand/90'
            )}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
          {error && (
            <div className="sm:col-span-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground/80">
          전체 quota
        </div>
        <div className="num mt-1 text-2xl font-bold tabular-nums">
          {total.toLocaleString()}
          <span className="ml-1 text-[15px] font-normal text-muted-foreground">
            / {totalLimit.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-border">
          <div
            className="h-full bg-brand"
            style={{ width: `${Math.min(100, (total / totalLimit) * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border bg-card">
        {loading && keys.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted-foreground">
            불러오는 중…
          </div>
        ) : keys.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted-foreground">
            등록된 키가 없습니다. 위 “+ 키 추가” 또는 .env에 YOUTUBE_API_KEY를 설정하세요.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {keys.map((k) => {
              const pct = Math.min(100, (k.used / Math.max(1, k.limit)) * 100);
              return (
                <li key={k.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        'grid h-6 w-6 place-items-center rounded-full text-[12px] ' +
                        (k.status === 'active'
                          ? 'bg-success/20 text-success'
                          : 'bg-warning/20 text-warning')
                      }
                    >
                      {k.status === 'active' ? '✓' : '!'}
                    </span>
                    <span className="text-[14.5px] font-semibold">{k.label}</span>
                    <span className="num text-[12.5px] text-muted-foreground">
                      {k.preview}
                    </span>
                    {k.source === 'env' && (
                      <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                        .env
                      </span>
                    )}
                    <span className="ml-auto num text-[13.5px] tabular-nums">
                      {k.used.toLocaleString()}{' '}
                      <span className="text-muted-foreground">
                        / {k.limit.toLocaleString()}
                      </span>
                    </span>
                    <span
                      className={
                        'rounded px-2 py-0.5 text-[11.5px] ' +
                        (k.status === 'active'
                          ? 'border border-success/40 text-success'
                          : 'border border-warning/40 text-warning')
                      }
                    >
                      {k.status === 'active' ? '활성' : '고갈 (17시 리셋)'}
                    </span>
                    {k.source === 'db' && (
                      <button
                        onClick={() => remove(k)}
                        className="rounded border border-border/60 bg-background/40 px-2 py-1 text-[12px] text-muted-foreground hover:border-destructive/60 hover:text-destructive"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded bg-border">
                    <div
                      className={
                        'h-full ' +
                        (k.status === 'active' ? 'bg-foreground/70' : 'bg-warning')
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
