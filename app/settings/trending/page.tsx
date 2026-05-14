'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Settings = {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: string | null;
  lastError: string | null;
  snapshotCount: number;
  latestCapturedAt: string | null;
};

const INTERVAL_OPTIONS = [1, 2, 3, 4, 6, 12, 24];

export default function TrendingSettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forcing, setForcing] = useState(false);
  const [forceMsg, setForceMsg] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const r = await fetch('/api/v1/trending-settings');
      const j = await r.json();
      if (j.success) setS(j.data);
      else setError(j.error?.message ?? '로드 실패');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = async (patch: Partial<Settings>) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/trending-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (!j.success) setError(j.error?.message ?? '저장 실패');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onForceRun = async () => {
    setForceMsg(null);
    setForcing(true);
    try {
      const r = await fetch('/api/cron/snapshot-trending?force=1');
      const j = await r.json();
      if (j.success) {
        setForceMsg(
          j.data.saved != null
            ? `✓ ${j.data.saved}개 저장됨`
            : `스킵: ${j.data.reason ?? '?'}`
        );
        await load();
      } else {
        setForceMsg('실패: ' + (j.error?.message ?? '?'));
      }
    } catch (e) {
      setForceMsg('네트워크 오류: ' + (e as Error).message);
    } finally {
      setForcing(false);
    }
  };

  if (!s) {
    return (
      <div className="px-4 py-8 text-sm text-muted-foreground">
        {error ? `⚠ ${error}` : '로딩 중…'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold tracking-tight">트렌딩 스냅샷 설정</h1>
      <p className="mb-6 text-[13px] text-muted-foreground">
        한국 mostPopular 200개를 주기적으로 DB에 저장해 누적 데이터로 보여줍니다.
        쇼츠가 적게 나오는 문제를 해결합니다.
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          ⚠ {error}
        </div>
      )}

      <div className="space-y-5 rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">자동 수집</div>
            <div className="text-[12px] text-muted-foreground">
              Cron 작동 여부 (Vercel cron 자체는 매시간 트리거됨, 이 토글이 실행 결정)
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={s.enabled}
            onClick={() => update({ enabled: !s.enabled })}
            disabled={saving}
            className={cn(
              'inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition disabled:opacity-50',
              s.enabled ? 'bg-primary' : 'bg-input'
            )}
          >
            <span
              className={cn(
                'pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg transition-transform',
                s.enabled ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        <div>
          <div className="mb-2 font-semibold">수집 주기</div>
          <div className="flex flex-wrap gap-2">
            {INTERVAL_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => update({ intervalHours: h })}
                disabled={saving}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm',
                  s.intervalHours === h
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                )}
              >
                {h}시간
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Vercel cron 이 매시간 트리거되지만, 이 주기 내에서만 실제로 실행됩니다.
          </p>
        </div>

        <div className="border-t pt-4">
          <div className="mb-3 grid grid-cols-2 gap-3 text-[13px]">
            <Stat label="누적 스냅샷" value={`${s.snapshotCount}건`} />
            <Stat
              label="마지막 캡처"
              value={s.latestCapturedAt ? fmtRelative(s.latestCapturedAt) : '없음'}
            />
            <Stat
              label="마지막 실행"
              value={s.lastRunAt ? fmtRelative(s.lastRunAt) : '없음'}
            />
            <Stat
              label="마지막 오류"
              value={s.lastError ? s.lastError.slice(0, 30) + '…' : '없음'}
              accent={s.lastError ? 'error' : 'muted'}
            />
          </div>

          <button
            onClick={onForceRun}
            disabled={forcing}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {forcing ? '실행 중…' : '⚡ 지금 한 번 강제 실행'}
          </button>
          {forceMsg && (
            <span className="ml-3 text-[13px] text-muted-foreground">{forceMsg}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'error' | 'muted';
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </div>
      <div
        className={cn(
          'num mt-0.5 text-[13.5px] font-medium',
          accent === 'error' && 'text-destructive',
          accent === 'muted' && 'text-muted-foreground'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function fmtRelative(iso: string): string {
  const date = new Date(iso);
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(ms / 3_600_000);
  const day = Math.floor(ms / 86_400_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  return `${day}일 전`;
}
