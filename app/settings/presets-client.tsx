'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Folder = { id: string; name: string };
type Preset = {
  id: string;
  name: string;
  folderId: string | null;
  platform: string;
  kind: string;
  recencyDays: number | null;
  minAgeDays: number | null;
  minViews: number;
  videoType: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastMatched: number | null;
  lastError: string | null;
};

const PLATFORMS = ['YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'XIAOHONGSHU', 'DOUYIN'];
const PLATFORM_LABEL: Record<string, string> = {
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  XIAOHONGSHU: '샤오홍수',
  DOUYIN: '도우인',
};
const KINDS = [
  { v: 'ALL', label: '전체' },
  { v: 'REFERENCE', label: '레퍼런스' },
  { v: 'SOURCE', label: '원본 소스' },
];
const VIDEO_TYPES = [
  { v: 'ALL', label: '전체' },
  { v: 'SHORTS', label: '쇼츠' },
  { v: 'LONG', label: '롱폼' },
];

export function PresetsClient({
  initial,
  folders,
  warning,
}: {
  initial: Preset[];
  folders: Folder[];
  warning: string | null;
}) {
  const router = useRouter();
  const [presets, setPresets] = useState<Preset[]>(initial);
  const [adding, setAdding] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch('/api/v1/scrape-presets', { cache: 'no-store' });
    const j = await r.json();
    if (j.success) setPresets(j.data);
    router.refresh();
  }

  async function addPreset(p: Partial<Preset>) {
    const r = await fetch('/api/v1/scrape-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    const j = await r.json();
    if (!j.success) {
      alert(`추가 실패: ${j.error?.message ?? 'unknown'}`);
      return;
    }
    setAdding(false);
    refresh();
  }

  async function patch(id: string, patch: Partial<Preset>) {
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
    await fetch(`/api/v1/scrape-presets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  async function remove(id: string) {
    if (!confirm('이 프리셋을 삭제할까요?')) return;
    await fetch(`/api/v1/scrape-presets/${id}`, { method: 'DELETE' });
    refresh();
  }

  async function runOne(p: Preset) {
    setRunningId(p.id);
    setResultMsg(null);
    try {
      const r = await fetch(`/api/v1/scrape-presets/${p.id}/run`, {
        method: 'POST',
      });
      const txt = await r.text();
      let j: { success?: boolean; data?: { matched: number; scraped: { dispatched: number; ok: number; failed: number } }; error?: { message?: string } } | null = null;
      try { j = JSON.parse(txt); } catch {}
      if (!r.ok || !j?.success) {
        setResultMsg(`❌ ${p.name}: ${j?.error?.message ?? `HTTP ${r.status}`}`);
        return;
      }
      const d = j.data!;
      setResultMsg(
        `✅ ${p.name} — 스크랩 ${d.scraped.ok}/${d.scraped.dispatched} 채널, 조건 만족 ${d.matched}개 영상`
      );
      refresh();
    } catch (e) {
      setResultMsg(`❌ ${p.name}: ${(e as Error).message}`);
    } finally {
      setRunningId(null);
    }
  }

  function openResults(p: Preset) {
    const params = new URLSearchParams();
    if (p.folderId) params.set('folderId', p.folderId);
    params.set('platforms', p.platform);
    if (p.recencyDays != null) {
      const d = p.recencyDays;
      params.set('period', d <= 1 ? '24h' : d <= 2 ? '48h' : d <= 7 ? '7d' : d <= 30 ? '30d' : 'all');
    }
    if (p.minViews > 0) params.set('minViews', String(p.minViews));
    params.set('sortBy', 'views');
    router.push(`/all?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold">스크랩 프리셋</h1>
        <span className="text-sm text-muted-foreground">
          카테고리·플랫폼·조건 별 자동 수집
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          {adding ? '취소' : '+ 새 프리셋'}
        </button>
      </div>

      {warning && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {warning}
        </div>
      )}

      {resultMsg && (
        <div className="mb-3 rounded-lg border bg-accent/40 px-3 py-2 text-[13px]">
          {resultMsg}
        </div>
      )}

      {adding && (
        <PresetForm
          folders={folders}
          onSubmit={(p) => addPreset(p)}
          onCancel={() => setAdding(false)}
        />
      )}

      {presets.length === 0 && !adding && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          프리셋이 없습니다. 우측 상단 새 프리셋 버튼으로 만들어보세요.
        </p>
      )}

      <ul className="space-y-2">
        {presets.map((p) => (
          <PresetRow
            key={p.id}
            p={p}
            folders={folders}
            running={runningId === p.id}
            onPatch={(patch) => patch && patchOne(p.id, patch)}
            onRemove={() => remove(p.id)}
            onRun={() => runOne(p)}
            onOpenResults={() => openResults(p)}
          />
        ))}
      </ul>

      <div className="mt-6 rounded-lg border bg-secondary/30 p-3 text-[13px] text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">⏰ 자동 실행 (cron)</p>
        활성화된 모든 프리셋을 자동 실행하려면 cron-job.org 에 등록:
        <code className="ml-1 rounded bg-background px-1.5 py-0.5 text-[12px]">
          {'/api/cron/scrape-presets?secret=<CRON_SECRET>'}
        </code>
      </div>
    </div>
  );

  function patchOne(id: string, p: Partial<Preset>) {
    return patch(id, p);
  }
}

function PresetRow({
  p,
  folders,
  running,
  onPatch,
  onRemove,
  onRun,
  onOpenResults,
}: {
  p: Preset;
  folders: Folder[];
  running: boolean;
  onPatch: (patch: Partial<Preset>) => void;
  onRemove: () => void;
  onRun: () => void;
  onOpenResults: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const folderName = folders.find((f) => f.id === p.folderId)?.name ?? '(전체)';

  if (editing) {
    return (
      <li>
        <PresetForm
          folders={folders}
          initial={p}
          onSubmit={async (patch) => {
            await fetch(`/api/v1/scrape-presets/${p.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            });
            setEditing(false);
            onPatch({}); // trigger reload
            location.reload();
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li
      className={`rounded-xl border bg-card/40 p-3 ${
        !p.enabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => onPatch({ enabled: e.target.checked })}
          className="mt-1.5 h-4 w-4"
          title="cron 자동 실행 ON/OFF"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold">{p.name}</span>
            {!p.enabled && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                OFF
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
            <Tag>📁 {folderName}</Tag>
            <Tag>📺 {PLATFORM_LABEL[p.platform] ?? p.platform}</Tag>
            <Tag>{p.kind === 'ALL' ? '🎯 전체' : p.kind === 'SOURCE' ? '⭐ 원본' : '📚 레퍼런스'}</Tag>
            {p.videoType !== 'ALL' && (
              <Tag>{p.videoType === 'SHORTS' ? '🎬 쇼츠' : '🎞 롱폼'}</Tag>
            )}
            {p.recencyDays != null && <Tag>🕒 최근 {p.recencyDays}일</Tag>}
            {p.minAgeDays != null && <Tag>📅 {p.minAgeDays}일 이전</Tag>}
            {p.minViews > 0 && <Tag>👁 {fmtViews(p.minViews)}+</Tag>}
          </div>
          {p.lastRunAt && (
            <p className="mt-1 text-[12px] text-muted-foreground/80">
              마지막 실행: {fmtTime(p.lastRunAt)} · 조건 매칭 {p.lastMatched ?? 0}개
              {p.lastError && <span className="text-rose-400"> · ⚠️ {p.lastError}</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={onRun}
            disabled={running}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[13px] font-semibold text-emerald-400 disabled:opacity-50"
          >
            {running ? '실행 중…' : '▶ 실행'}
          </button>
          <button
            onClick={onOpenResults}
            className="rounded-md border px-2.5 py-1 text-[13px]"
          >
            결과 보기
          </button>
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border px-2.5 py-1 text-[12px] text-muted-foreground"
          >
            수정
          </button>
          <button
            onClick={onRemove}
            className="rounded-md border px-2.5 py-1 text-[12px] text-rose-400 hover:border-rose-500/40"
          >
            삭제
          </button>
        </div>
      </div>
    </li>
  );
}

function PresetForm({
  folders,
  initial,
  onSubmit,
  onCancel,
}: {
  folders: Folder[];
  initial?: Partial<Preset>;
  onSubmit: (p: Partial<Preset>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Preset>>({
    name: '',
    folderId: null,
    platform: 'YOUTUBE',
    kind: 'ALL',
    videoType: 'ALL',
    recencyDays: 7,
    minAgeDays: null,
    minViews: 50000,
    enabled: true,
    ...initial,
  });
  const set = <K extends keyof Preset>(k: K, v: Preset[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = (form.name ?? '').trim().length > 0;

  return (
    <div className="mb-3 rounded-xl border bg-card/40 p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="이름 *">
          <input
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
            placeholder="예: 정치_보수 SOURCE 7일 5만+"
            className="h-9 w-full rounded border bg-background px-2 text-[14px]"
          />
        </Field>
        <Field label="카테고리(폴더)">
          <select
            value={form.folderId ?? ''}
            onChange={(e) => set('folderId', (e.target.value || null) as never)}
            className="h-9 w-full rounded border bg-background px-2 text-[14px]"
          >
            <option value="">(전체)</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="플랫폼">
          <select
            value={form.platform ?? 'YOUTUBE'}
            onChange={(e) => set('platform', e.target.value)}
            className="h-9 w-full rounded border bg-background px-2 text-[14px]"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="종류">
          <select
            value={form.kind ?? 'ALL'}
            onChange={(e) => set('kind', e.target.value)}
            className="h-9 w-full rounded border bg-background px-2 text-[14px]"
          >
            {KINDS.map((k) => (
              <option key={k.v} value={k.v}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="영상 유형">
          <select
            value={form.videoType ?? 'ALL'}
            onChange={(e) => set('videoType', e.target.value)}
            className="h-9 w-full rounded border bg-background px-2 text-[14px]"
          >
            {VIDEO_TYPES.map((v) => (
              <option key={v.v} value={v.v}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="최근 N일 (이내)">
          <input
            type="number"
            min={0}
            value={form.recencyDays ?? ''}
            onChange={(e) =>
              set('recencyDays', (e.target.value === '' ? null : Number(e.target.value)) as never)
            }
            placeholder="없으면 비움"
            className="h-9 w-full rounded border bg-background px-2 text-[14px]"
          />
        </Field>
        <Field label="이전 N일 (이전)">
          <input
            type="number"
            min={0}
            value={form.minAgeDays ?? ''}
            onChange={(e) =>
              set('minAgeDays', (e.target.value === '' ? null : Number(e.target.value)) as never)
            }
            placeholder="예: 90"
            className="h-9 w-full rounded border bg-background px-2 text-[14px]"
          />
        </Field>
        <Field label="최소 조회수">
          <input
            type="number"
            min={0}
            value={form.minViews ?? 0}
            onChange={(e) => set('minViews', Number(e.target.value) || 0)}
            className="h-9 w-full rounded border bg-background px-2 text-[14px]"
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-[13px] text-muted-foreground"
        >
          취소
        </button>
        <button
          onClick={() => onSubmit(form)}
          disabled={!valid}
          className="rounded-md bg-primary px-3 py-1.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          저장
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[12px] text-foreground/80">
      {children}
    </span>
  );
}

function fmtViews(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}천`;
  return String(n);
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
