'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type ScheduledVideo = {
  id: string;
  channelId: string;
  title: string;
  notes: string | null;
  scheduledAt: string;
  status: string;
  gcalEventId: string | null;
  gcalSyncedAt: string | null;
};

type YtOauth = {
  id: string;
  youtubeChannelName: string | null;
  accountEmail: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

type ChannelMaterial = {
  id: string;
  channelId: string;
  url: string;
  note: string | null;
  createdAt: string;
};

type MyChannel = {
  id: string;
  name: string;
  category: string | null;
  url: string | null;
  adsense: string | null;
  email: string | null;
  sortOrder: number;
  isActive: boolean;
  videos: ScheduledVideo[];
  youtubeOauth: YtOauth | null;
  materials: ChannelMaterial[];
};

type GoogleStatus = {
  connected: boolean;
  email: string | null;
  calendarId: string | null;
};

function fmt(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function toInputValue(iso: string): string {
  // datetime-local input 형식: YYYY-MM-DDTHH:mm (로컬 타임존)
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MySchedulePage() {
  const [channels, setChannels] = useState<MyChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [google, setGoogle] = useState<GoogleStatus>({ connected: false, email: null, calendarId: null });
  const [loading, setLoading] = useState(true);
  const [setupWarning, setSetupWarning] = useState<string | null>(null);

  // 채널 추가 폼
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUrl, setNewUrl] = useState('');

  // 영상 추가 폼
  const [vTitle, setVTitle] = useState('');
  const [vWhen, setVWhen] = useState('');
  const [vNotes, setVNotes] = useState('');

  // 일괄 선택 (체크박스)
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [bulkTitle, setBulkTitle] = useState('');
  const [bulkWhen, setBulkWhen] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleBulk = (id: string) =>
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearBulk = () => setBulkIds(new Set());

  const refresh = async () => {
    try {
      const [c, g] = await Promise.all([
        fetch('/api/v1/my-schedule/channels', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/google/status', { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => ({ success: false })),
      ]);
      if (c.success) {
        setChannels(c.data ?? []);
        setSetupWarning(c.warning ?? null);
      } else {
        setSetupWarning(c.error?.message ?? '채널 목록 로드 실패');
      }
      if (g.success) setGoogle(g.data);
    } catch (e) {
      setSetupWarning('네트워크 오류: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const selected = channels.find((c) => c.id === selectedChannelId) ?? null;

  const addChannel = async (): Promise<string | null> => {
    if (!newName.trim()) return null;
    const r = await fetch('/api/v1/my-schedule/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, category: newCategory, url: newUrl }),
    });
    const j = await r.json();
    if (j.success) {
      setNewName('');
      setNewCategory('');
      setNewUrl('');
      setSelectedChannelId(j.data.id);
      refresh();
      return j.data.id as string;
    }
    alert(j.error?.message ?? '실패');
    return null;
  };

  const removeChannel = async (id: string) => {
    if (!confirm('이 채널과 모든 예약 영상을 삭제할까요?')) return;
    await fetch(`/api/v1/my-schedule/channels/${id}`, { method: 'DELETE' });
    if (selectedChannelId === id) setSelectedChannelId(null);
    refresh();
  };

  const updateChannel = async (id: string, patch: Partial<MyChannel>) => {
    await fetch(`/api/v1/my-schedule/channels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    refresh();
  };

  const addVideo = async () => {
    if (!selected || !vWhen) return;
    const r = await fetch('/api/v1/my-schedule/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: selected.id,
        title: vTitle,
        scheduledAt: new Date(vWhen).toISOString(),
        notes: vNotes,
      }),
    });
    const j = await r.json();
    if (j.success) {
      setVTitle('');
      setVWhen('');
      setVNotes('');
      refresh();
    } else alert(j.error?.message ?? '실패');
  };

  const updateVideo = async (id: string, patch: Record<string, unknown>) => {
    await fetch(`/api/v1/my-schedule/videos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    refresh();
  };

  const addMaterial = async (channelId: string, url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const r = await fetch(`/api/v1/my-schedule/channels/${channelId}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed }),
    });
    const j = await r.json();
    if (j.success) refresh();
    else alert(j.error?.message ?? '실패');
  };

  const removeMaterial = async (id: string) => {
    await fetch(`/api/v1/my-schedule/materials/${id}`, { method: 'DELETE' });
    refresh();
  };

  const removeVideo = async (id: string) => {
    if (!confirm('이 예약 영상을 삭제할까요? (구글캘린더 이벤트도 함께 삭제됨)')) return;
    await fetch(`/api/v1/my-schedule/videos/${id}`, { method: 'DELETE' });
    refresh();
  };

  const bulkAdd = async () => {
    const ids = [...bulkIds];
    if (ids.length === 0 || !bulkWhen) return;
    setBulkBusy(true);
    try {
      const r = await fetch('/api/v1/my-schedule/videos/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelIds: ids,
          title: bulkTitle,
          scheduledAt: new Date(bulkWhen).toISOString(),
        }),
      });
      const j = await r.json();
      if (j.success) {
        setBulkTitle('');
        setBulkWhen('');
        clearBulk();
        refresh();
      } else alert(j.error?.message ?? '실패');
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkClear = async () => {
    const ids = [...bulkIds];
    if (ids.length === 0) return;
    if (
      !confirm(
        `${ids.length}개 채널의 예약 영상을 모두 삭제하고 "업로드 필요" 상태로 만들까요?`
      )
    )
      return;
    setBulkBusy(true);
    try {
      await fetch('/api/v1/my-schedule/videos/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelIds: ids }),
      });
      clearBulk();
      refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const connectGoogle = async () => {
    const r = await fetch('/api/google/auth/start');
    const j = await r.json();
    if (!j.success) {
      alert(j.error?.message ?? '실패');
      return;
    }
    window.open(j.data.url, '_blank', 'width=520,height=640');
    const iv = setInterval(async () => {
      const s = await fetch('/api/google/status').then((r) => r.json());
      if (s.success && s.data.connected) {
        clearInterval(iv);
        refresh();
      }
    }, 1500);
    setTimeout(() => clearInterval(iv), 5 * 60_000);
  };

  const disconnectGoogle = async () => {
    if (!confirm('Google 캘린더 연결을 해제할까요? (기존 이벤트는 캘린더에 남음)')) return;
    await fetch('/api/google/status', { method: 'DELETE' });
    refresh();
  };

  const [syncingGcal, setSyncingGcal] = useState(false);

  const syncGcalAll = async () => {
    setSyncingGcal(true);
    try {
      const r = await fetch('/api/v1/my-schedule/sync-gcal-all', { method: 'POST' });
      const j = await r.json();
      if (!j.success) alert(j.error?.message ?? '실패');
      else alert(`✓ 캘린더 동기화 완료 (${j.data.synced}/${j.data.total} 채널)`);
      refresh();
    } finally {
      setSyncingGcal(false);
    }
  };


  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">로딩 중…</div>;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {setupWarning && (
        <div className="border-b border-amber-500/30 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          ⚠️ {setupWarning}
        </div>
      )}
      {syncingGcal && (
        <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Google 캘린더 전체 동기화 진행 중… (활성 채널 모두 처리)
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
      {/* 좌측: 채널 리스트 */}
      <aside className="flex w-72 shrink-0 flex-col border-r">
        <div className="border-b p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">내 채널</h2>
            <span className="text-xs text-muted-foreground">{channels.length}개</span>
          </div>
          <div className="space-y-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="채널명 *"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="카테고리 (예: 푸드, 게임)"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="채널 URL"
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            />
            <button
              onClick={() => addChannel()}
              disabled={!newName.trim()}
              className="h-8 w-full rounded-md bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              + 채널 추가
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {channels.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              아직 채널이 없습니다
            </p>
          ) : (
            channels.map((c) => {
              const sorted = [...c.videos].sort(
                (a, b) =>
                  new Date(b.scheduledAt).getTime() -
                  new Date(a.scheduledAt).getTime()
              );
              const last = sorted[0];
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedChannelId(c.id)}
                  className={cn(
                    'mb-1 block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                    selectedChannelId === c.id && 'bg-accent font-semibold',
                    !c.isActive && 'opacity-50'
                  )}
                >
                  <div className="truncate">
                    {c.name}
                    {!c.isActive && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(비활성)</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-2 text-[10.5px] text-muted-foreground">
                    {c.category && <span>{c.category}</span>}
                    <span>· {c.videos.length}개 예약</span>
                  </div>
                  {last && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground/80">
                      마지막: {fmt(last.scheduledAt)}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Google 연결 영역 */}
        <div className="border-t bg-secondary/30 p-3">
          <div className="mb-1.5 text-[11px] font-semibold">Google 캘린더</div>
          {google.connected ? (
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted-foreground">
                ✓ 연결됨 {google.email ? `(${google.email})` : ''}
              </div>
              <button
                onClick={disconnectGoogle}
                className="h-7 w-full rounded-md border bg-background text-[11px] text-muted-foreground hover:border-destructive/40 hover:text-foreground"
              >
                연결 해제
              </button>
            </div>
          ) : (
            <button
              onClick={connectGoogle}
              className="h-7 w-full rounded-md bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Google 캘린더 연결
            </button>
          )}
        </div>
      </aside>

      {/* 우측: 채널 대시보드 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 일괄 작업 툴바 — 채널 1개 이상 선택 시 노출 */}
        {bulkIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/40 bg-primary/10 px-4 py-2.5 text-xs">
            <span className="rounded bg-primary px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-primary-foreground">
              {bulkIds.size}개 선택됨
            </span>
            <button
              onClick={clearBulk}
              className="rounded border bg-card px-2 py-1 text-[11px] text-muted-foreground hover:border-foreground/40"
            >
              ✕ 선택 해제
            </button>
            <input
              value={bulkTitle}
              onChange={(e) => setBulkTitle(e.target.value)}
              placeholder="제목 (선택)"
              className="h-7 w-48 rounded border bg-background px-2 text-xs"
            />
            <input
              type="datetime-local"
              value={bulkWhen}
              onChange={(e) => setBulkWhen(e.target.value)}
              className="h-7 rounded border bg-background px-2 text-xs"
            />
            <button
              onClick={bulkAdd}
              disabled={!bulkWhen || bulkBusy}
              className="h-7 rounded-md bg-primary px-3 text-[11.5px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              + 일괄 예약 추가
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={bulkClear}
              disabled={bulkBusy}
              className="h-7 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 text-[11.5px] font-bold text-amber-700 hover:bg-amber-500/20 disabled:opacity-40 dark:text-amber-300"
            >
              ⚠️ 업로드 필요로 변경 (예약 비우기)
            </button>
            {google.connected && (
              <button
                onClick={syncGcalAll}
                disabled={syncingGcal || bulkBusy}
                className="ml-auto h-7 rounded-md border bg-card px-3 text-[11.5px] hover:border-foreground/40 disabled:opacity-40"
                title="캘린더 전체 동기화"
              >
                {syncingGcal ? '동기화 중…' : '🗓️ 캘린더 동기화'}
              </button>
            )}
          </div>
        )}
        {bulkIds.size === 0 && google.connected && (
          <div className="flex items-center gap-3 border-b bg-secondary/30 px-6 py-2.5 text-xs">
            <button
              onClick={syncGcalAll}
              disabled={syncingGcal}
              className="rounded-md border bg-card px-3 py-1 hover:border-foreground/40 disabled:opacity-40"
            >
              {syncingGcal ? '동기화 중…' : '🗓️ 캘린더 전체 동기화'}
            </button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              채널 행의 체크박스로 다중 선택 → 일괄 예약 추가/비우기
            </span>
          </div>
        )}
        {channels.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            왼쪽에서 채널을 추가하세요
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-[11px] uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="w-9 px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={
                        channels.length > 0 && bulkIds.size === channels.length
                      }
                      onChange={(e) =>
                        setBulkIds(
                          e.target.checked
                            ? new Set(channels.map((c) => c.id))
                            : new Set()
                        )
                      }
                      className="h-3.5 w-3.5"
                    />
                  </th>
                  <th className="w-[22%] px-4 py-2 text-left font-semibold">채널</th>
                  <th className="w-[8%] px-4 py-2 text-left font-semibold">카테고리</th>
                  <th className="w-[18%] px-4 py-2 text-left font-semibold">소재</th>
                  <th className="w-[10%] px-4 py-2 text-left font-semibold">애드센스</th>
                  <th className="px-4 py-2 text-left font-semibold">마지막 예약 영상</th>
                  <th className="w-[14%] px-4 py-2 text-left font-semibold">예약일시</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => {
                  const sorted = [...c.videos].sort(
                    (a, b) =>
                      new Date(b.scheduledAt).getTime() -
                      new Date(a.scheduledAt).getTime()
                  );
                  const last = sorted[0];
                  const isExpanded = selectedChannelId === c.id;
                  return (
                    <DashRow
                      key={c.id}
                      c={c}
                      last={last}
                      isExpanded={isExpanded}
                      checked={bulkIds.has(c.id)}
                      onCheck={() => toggleBulk(c.id)}
                      onToggle={() =>
                        setSelectedChannelId(isExpanded ? null : c.id)
                      }
                      onUpdate={updateChannel}
                      onRemove={() => removeChannel(c.id)}
                      onAddVideo={async (t, w, n) => {
                        if (!w) return;
                        await fetch('/api/v1/my-schedule/videos', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            channelId: c.id,
                            title: t,
                            scheduledAt: new Date(w).toISOString(),
                            notes: n,
                          }),
                        });
                        refresh();
                      }}
                      onUpdateVideo={updateVideo}
                      onRemoveVideo={removeVideo}
                      onAddMaterial={(url) => addMaterial(c.id, url)}
                      onRemoveMaterial={removeMaterial}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

function DashRow({
  c,
  last,
  isExpanded,
  checked,
  onCheck,
  onToggle,
  onUpdate,
  onRemove,
  onAddVideo,
  onUpdateVideo,
  onRemoveVideo,
  onAddMaterial,
  onRemoveMaterial,
}: {
  c: MyChannel;
  last?: ScheduledVideo;
  isExpanded: boolean;
  checked: boolean;
  onCheck: () => void;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<MyChannel>) => void;
  onRemove: () => void;
  onAddVideo: (title: string, when: string, notes: string) => void;
  onUpdateVideo: (id: string, patch: Record<string, unknown>) => void;
  onRemoveVideo: (id: string) => void;
  onAddMaterial: (url: string) => void;
  onRemoveMaterial: (id: string) => void;
}) {
  const [vTitle, setVTitle] = useState('');
  const [vWhen, setVWhen] = useState('');
  const [vNotes, setVNotes] = useState('');

  const sortedAsc = [...c.videos].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  return (
    <>
      <tr
        className={cn(
          'border-b hover:bg-accent/30',
          !c.isActive && 'opacity-50',
          isExpanded && 'bg-accent/40',
          checked && 'bg-primary/5'
        )}
      >
        <td className="px-2 py-2.5 text-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheck}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5"
          />
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggle}
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate font-semibold">{c.name}</span>
                {!c.isActive && (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    (비활성)
                  </span>
                )}
              </div>
              <InlineTextCell
                value={c.email}
                placeholder="이메일"
                onSave={(v) => onUpdate(c.id, { email: v } as Partial<MyChannel>)}
                small
              />
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">
          {c.category ?? '—'}
        </td>
        <td className="px-4 py-2.5 text-xs">
          <MaterialsCell
            materials={c.materials}
            onAdd={onAddMaterial}
            onRemove={onRemoveMaterial}
          />
        </td>
        <td className="px-4 py-2.5 text-xs">
          <InlineTextCell
            value={c.adsense}
            placeholder="애드센스"
            onSave={(v) => onUpdate(c.id, { adsense: v } as Partial<MyChannel>)}
          />
        </td>
        <td className="px-4 py-2.5">
          <InlineTitleCell
            last={last}
            count={c.videos.length}
            onSaveExisting={(id, title) => onUpdateVideo(id, { title })}
            onCreate={(title) => onAddVideo(title, todayKstInputValue(), '')}
          />
        </td>
        <td className="px-4 py-2.5 text-xs">
          <InlineDateCell
            last={last}
            onSaveExisting={(id, iso) => onUpdateVideo(id, { scheduledAt: iso })}
            onCreate={(localStr) => onAddVideo('', localStr, '')}
          />
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b bg-secondary/20">
          <td colSpan={7} className="px-6 py-3">
            {/* 채널 메타 인라인 편집 */}
            <div className="mb-3 grid grid-cols-12 gap-2">
              <input
                value={c.name}
                onChange={(e) => onUpdate(c.id, { name: e.target.value } as Partial<MyChannel>)}
                onBlur={(e) => onUpdate(c.id, { name: e.target.value } as Partial<MyChannel>)}
                placeholder="채널명"
                className="col-span-4 h-8 rounded border bg-background px-2 text-xs"
              />
              <input
                value={c.category ?? ''}
                onChange={(e) => onUpdate(c.id, { category: e.target.value } as Partial<MyChannel>)}
                onBlur={(e) => onUpdate(c.id, { category: e.target.value } as Partial<MyChannel>)}
                placeholder="카테고리"
                className="col-span-2 h-8 rounded border bg-background px-2 text-xs"
              />
              <input
                value={c.url ?? ''}
                onChange={(e) => onUpdate(c.id, { url: e.target.value } as Partial<MyChannel>)}
                onBlur={(e) => onUpdate(c.id, { url: e.target.value } as Partial<MyChannel>)}
                placeholder="URL"
                className="col-span-6 h-8 rounded border bg-background px-2 text-xs"
              />
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  onUpdate(c.id, { isActive: !c.isActive } as Partial<MyChannel>)
                }
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[11px]',
                  c.isActive
                    ? 'bg-card hover:border-foreground/40'
                    : 'border-amber-500/40 bg-amber-100/50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200'
                )}
              >
                {c.isActive ? '⏸️ 비활성화' : '▶️ 활성화'}
              </button>
              <button
                onClick={onRemove}
                className="rounded-md border bg-card px-2.5 py-1 text-[11px] hover:border-destructive/40"
              >
                🗑️ 채널 삭제
              </button>
            </div>

            {/* 영상 추가 폼 */}
            <div className="mb-3 grid grid-cols-12 gap-2">
              <input
                value={vTitle}
                onChange={(e) => setVTitle(e.target.value)}
                placeholder="영상 제목 (선택)"
                className="col-span-5 h-8 rounded border bg-background px-2 text-xs"
              />
              <input
                type="datetime-local"
                value={vWhen}
                onChange={(e) => setVWhen(e.target.value)}
                className="col-span-3 h-8 rounded border bg-background px-2 text-xs"
              />
              <input
                value={vNotes}
                onChange={(e) => setVNotes(e.target.value)}
                placeholder="메모 (선택)"
                className="col-span-3 h-8 rounded border bg-background px-2 text-xs"
              />
              <button
                onClick={() => {
                  onAddVideo(vTitle, vWhen, vNotes);
                  setVTitle('');
                  setVWhen('');
                  setVNotes('');
                }}
                disabled={!vWhen}
                className="col-span-1 h-8 rounded bg-primary text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                + 예약
              </button>
            </div>

            {/* 영상 리스트 — 컴팩트 한 줄 */}
            {sortedAsc.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-muted-foreground">
                예약 영상 없음
              </p>
            ) : (
              <ul className="space-y-1">
                {sortedAsc.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-2 rounded border bg-background px-2 py-1.5 text-xs"
                  >
                    <input
                      type="datetime-local"
                      value={toInputValue(v.scheduledAt)}
                      onChange={(e) =>
                        onUpdateVideo(v.id, {
                          scheduledAt: new Date(e.target.value).toISOString(),
                        })
                      }
                      className="h-6 w-[150px] rounded border bg-background px-1 text-[11px]"
                    />
                    <input
                      value={v.title}
                      onChange={(e) => onUpdateVideo(v.id, { title: e.target.value })}
                      placeholder="제목 (선택)"
                      className="flex-1 border-none bg-transparent outline-none"
                    />
                    {v.notes && (
                      <span
                        className="truncate text-[10px] text-muted-foreground"
                        title={v.notes}
                      >
                        {v.notes}
                      </span>
                    )}
                    <button
                      onClick={() => onRemoveVideo(v.id)}
                      className="rounded border bg-background px-1.5 text-[10px] hover:border-destructive/40"
                    >
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function InlineTitleCell({
  last,
  count,
  onSaveExisting,
  onCreate,
}: {
  last?: ScheduledVideo;
  count: number;
  onSaveExisting: (id: string, title: string) => void;
  onCreate: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(last?.title ?? '');
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (last) {
      if (v !== last.title) onSaveExisting(last.id, v);
    } else if (v) {
      onCreate(v);
    }
  };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder="제목"
        className="h-7 w-full rounded border bg-background px-2 text-xs"
      />
    );
  }

  return (
    <div
      onClick={start}
      className="cursor-text rounded px-1 py-0.5 hover:bg-accent/40"
      title="클릭해서 수정"
    >
      {last ? (
        <div className="truncate text-xs">
          {last.title || (
            <span className="italic text-muted-foreground">제목 없음</span>
          )}
          <span className="ml-1.5 text-sm font-bold">({count})</span>
        </div>
      ) : (
        <span className="text-xs text-amber-700 dark:text-amber-300">
          ⚠️ 영상 없음 — 업로드 필요
          <span className="ml-1.5 text-sm font-bold">(0)</span>
        </span>
      )}
    </div>
  );
}

function InlineDateCell({
  last,
  onSaveExisting,
  onCreate,
}: {
  last?: ScheduledVideo;
  onSaveExisting: (id: string, iso: string) => void;
  onCreate: (localStr: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(last ? toInputValue(last.scheduledAt) : todayKstInputValue());
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (!draft) return;
    if (last) {
      const iso = new Date(draft).toISOString();
      if (iso !== new Date(last.scheduledAt).toISOString()) {
        onSaveExisting(last.id, iso);
      }
    } else {
      onCreate(draft); // datetime-local 포맷 그대로 — addVideo 가 new Date() 로 로컬 해석
    }
  };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        autoFocus
        type="datetime-local"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            cancel();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="h-7 rounded border bg-background px-2 text-xs"
      />
    );
  }

  return (
    <div
      onClick={start}
      className="cursor-text rounded px-1 py-0.5 hover:bg-accent/40"
      title="클릭해서 수정"
    >
      {last ? (
        <span className="font-semibold">{fmt(last.scheduledAt)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}

function todayKstInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function InlineTextCell({
  value,
  placeholder,
  onSave,
  small,
}: {
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
  small?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(value ?? '');
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if ((value ?? '') !== v) onSave(v || null);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className={cn(
          'w-full rounded border bg-background px-2',
          small ? 'h-5 text-[10px]' : 'h-7 text-xs'
        )}
      />
    );
  }

  return (
    <div
      onClick={start}
      className={cn(
        'cursor-text truncate rounded hover:bg-accent/40',
        small ? 'px-1 text-[10px] leading-tight text-muted-foreground' : 'px-1 py-0.5'
      )}
      title={value ?? `${placeholder} (클릭해서 입력)`}
    >
      {value ? (
        <span className={small ? '' : 'font-medium'}>{value}</span>
      ) : (
        <span className="text-muted-foreground/60">
          {small ? placeholder : '—'}
        </span>
      )}
    </div>
  );
}

function MaterialsCell({
  materials,
  onAdd,
  onRemove,
}: {
  materials: ChannelMaterial[];
  onAdd: (url: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const commit = () => {
    const v = draft.trim();
    if (v) onAdd(v);
    setDraft('');
    setAdding(false);
  };

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-1">
      {materials.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="text-[11px] text-muted-foreground/70 hover:text-foreground"
        >
          + 소재 URL
        </button>
      )}
      {materials.map((m) => (
        <label
          key={m.id}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/40"
        >
          <input
            type="checkbox"
            checked={false}
            onChange={() => onRemove(m.id)}
            className="h-3 w-3 shrink-0"
            title="체크하면 사용 완료 처리되어 사라집니다"
          />
          <a
            href={m.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[11px] text-blue-600 hover:underline dark:text-blue-400"
            title={m.url}
          >
            {m.url}
          </a>
        </label>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
          placeholder={
            materials.length >= 3
              ? '추가 시 가장 오래된 소재가 삭제됩니다'
              : 'https://...'
          }
          className="h-6 w-full rounded border bg-background px-1.5 text-[11px]"
        />
      ) : (
        materials.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="text-[10.5px] text-muted-foreground/70 hover:text-foreground"
            title={
              materials.length >= 3
                ? '최대 3개 — 추가하면 가장 오래된 소재가 삭제됩니다'
                : '소재 URL 추가'
            }
          >
            + 추가{materials.length >= 3 && ' (오래된 것 자동 삭제)'}
          </button>
        )
      )}
    </div>
  );
}
