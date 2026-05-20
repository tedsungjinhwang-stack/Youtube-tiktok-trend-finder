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

type MyChannel = {
  id: string;
  name: string;
  category: string | null;
  url: string | null;
  sortOrder: number;
  isActive: boolean;
  videos: ScheduledVideo[];
  youtubeOauth: YtOauth | null;
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

  const refresh = async () => {
    try {
      const [c, g] = await Promise.all([
        fetch('/api/v1/my-schedule/channels').then((r) => r.json()),
        fetch('/api/google/status')
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

  /** 채널 + YouTube 연결. 이름 비워둬도 OK — OAuth 후 자동 채움 */
  const addChannelWithYoutube = async () => {
    const r = await fetch('/api/v1/my-schedule/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, category: newCategory, url: newUrl }),
    });
    const j = await r.json();
    if (!j.success) {
      alert(j.error?.message ?? '실패');
      return;
    }
    setNewName('');
    setNewCategory('');
    setNewUrl('');
    setSelectedChannelId(j.data.id);
    refresh();
    await connectYoutube(j.data.id);
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

  const removeVideo = async (id: string) => {
    if (!confirm('이 예약 영상을 삭제할까요? (구글캘린더 이벤트도 함께 삭제됨)')) return;
    await fetch(`/api/v1/my-schedule/videos/${id}`, { method: 'DELETE' });
    refresh();
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

  const connectYoutube = async (channelId: string) => {
    const r = await fetch(`/api/google/auth/start?kind=youtube&channelId=${channelId}`);
    const j = await r.json();
    if (!j.success) {
      alert(j.error?.message ?? '실패');
      return;
    }
    window.open(j.data.url, '_blank', 'width=520,height=640');
    const iv = setInterval(async () => {
      const s = await fetch('/api/v1/my-schedule/channels').then((r) => r.json());
      const ch = (s.data ?? []).find((c: MyChannel) => c.id === channelId);
      if (ch?.youtubeOauth) {
        clearInterval(iv);
        refresh();
      }
    }, 1500);
    setTimeout(() => clearInterval(iv), 5 * 60_000);
  };

  const [syncingGcal, setSyncingGcal] = useState(false);
  const [syncingYt, setSyncingYt] = useState(false);

  const syncYoutubeAll = async () => {
    setSyncingYt(true);
    try {
      const r = await fetch('/api/v1/my-schedule/sync-yt-all', { method: 'POST' });
      const j = await r.json();
      if (!j.success) alert(j.error?.message ?? '실패');
      else
        alert(
          `✓ YouTube 동기화 완료 (${j.data.synced}/${j.data.total} 채널, 총 ${j.data.totalVideos}개 영상)`
        );
      refresh();
    } finally {
      setSyncingYt(false);
    }
  };

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

  const disconnectYoutube = async (channelId: string) => {
    if (!confirm('이 채널의 YouTube 연결을 해제할까요? (이미 가져온 영상은 남음)')) return;
    await fetch(`/api/v1/my-schedule/channels/${channelId}/yt`, { method: 'DELETE' });
    refresh();
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
      {(syncingGcal || syncingYt) && (
        <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {syncingGcal && 'Google 캘린더 전체 동기화 진행 중… (활성 채널 모두 처리)'}
          {syncingYt && 'YouTube 전체 동기화 진행 중… (영상 가져오기 + 캘린더 반영, 채널당 5~15초 소요)'}
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
              + 채널만 추가
            </button>
            <button
              onClick={addChannelWithYoutube}
              className="h-8 w-full rounded-md border border-primary/40 bg-primary/10 text-[11px] font-semibold text-primary hover:bg-primary/20"
              title="채널 생성 + YouTube OAuth. 이름 비워두면 YouTube 채널명으로 자동 채움"
            >
              + 채널 추가 & ▶️ YouTube 연결
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

      {/* 우측: 채널 대시보드 — 모든 채널의 마지막 예약 영상 한눈에 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* 전체 적용 동기화 바 (Google 연결됨일 때만) */}
        {google.connected && (
          <div className="flex items-center gap-3 border-b bg-primary/5 px-6 py-3">
            <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              전체 적용
            </span>
            <button
              onClick={syncGcalAll}
              disabled={syncingGcal || syncingYt}
              className="flex h-10 items-center gap-2 rounded-lg border-2 border-primary/50 bg-primary/10 px-5 text-sm font-bold text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              title="활성 채널 전체 캘린더 이벤트 강제 갱신"
            >
              {syncingGcal ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  캘린더 동기화 중…
                </>
              ) : (
                <>🗓️ 캘린더 전체 동기화</>
              )}
            </button>
            <button
              onClick={syncYoutubeAll}
              disabled={syncingGcal || syncingYt}
              className="flex h-10 items-center gap-2 rounded-lg border-2 border-primary/50 bg-primary/10 px-5 text-sm font-bold text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              title="YouTube 연결된 활성 채널 전체 예약 영상 가져오기"
            >
              {syncingYt ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  YouTube 동기화 중…
                </>
              ) : (
                <>🔄 YouTube 전체 동기화</>
              )}
            </button>
            <span className="ml-auto text-[11px] font-semibold text-foreground/80">
              ⏰ 자동 동기화: 매일 KST 02:00
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
                  <th className="w-[28%] px-4 py-2 text-left font-semibold">채널</th>
                  <th className="w-[12%] px-4 py-2 text-left font-semibold">카테고리</th>
                  <th className="px-4 py-2 text-left font-semibold">마지막 예약 영상</th>
                  <th className="w-[16%] px-4 py-2 text-left font-semibold">예약일시</th>
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
                      onToggle={() =>
                        setSelectedChannelId(isExpanded ? null : c.id)
                      }
                      onUpdate={updateChannel}
                      onRemove={() => removeChannel(c.id)}
                      onConnectYt={() => connectYoutube(c.id)}
                      onDisconnectYt={async () => {
                        if (
                          !confirm('이 채널의 YouTube 연결을 해제할까요?')
                        )
                          return;
                        await fetch(
                          `/api/v1/my-schedule/channels/${c.id}/yt`,
                          { method: 'DELETE' }
                        );
                        refresh();
                      }}
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
  onToggle,
  onUpdate,
  onRemove,
  onConnectYt,
  onDisconnectYt,
  onAddVideo,
  onUpdateVideo,
  onRemoveVideo,
}: {
  c: MyChannel;
  last?: ScheduledVideo;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<MyChannel>) => void;
  onRemove: () => void;
  onConnectYt: () => void;
  onDisconnectYt: () => void;
  onAddVideo: (title: string, when: string, notes: string) => void;
  onUpdateVideo: (id: string, patch: Record<string, unknown>) => void;
  onRemoveVideo: (id: string) => void;
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
          isExpanded && 'bg-accent/40'
        )}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggle}
              className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-accent"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
            <div className="min-w-0">
              <div className="truncate font-semibold">
                {c.name}
                {!c.isActive && (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    (비활성)
                  </span>
                )}
              </div>
              {c.youtubeOauth && (
                <div
                  className="text-[10px] text-muted-foreground"
                  title={c.youtubeOauth.accountEmail ?? ''}
                >
                  ▶️ {c.youtubeOauth.youtubeChannelName ?? 'YT 연결됨'}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">
          {c.category ?? '—'}
        </td>
        <td className="px-4 py-2.5">
          {last ? (
            <div className="truncate text-xs" title={last.title}>
              {last.title || (
                <span className="italic text-muted-foreground">제목 없음</span>
              )}
              <span className="ml-1.5 text-sm font-bold">
                ({c.videos.length})
              </span>
            </div>
          ) : (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ 영상 없음 — 업로드 필요
              <span className="ml-1.5 text-sm font-bold">(0)</span>
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-xs">
          {last ? (
            <span className="font-semibold">{fmt(last.scheduledAt)}</span>
          ) : (
            '—'
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b bg-secondary/20">
          <td colSpan={4} className="px-6 py-3">
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
              {c.youtubeOauth ? (
                <button
                  onClick={onDisconnectYt}
                  className="rounded-md border bg-card px-2.5 py-1 text-[11px] hover:border-destructive/40"
                >
                  ▶️ YT 연결 해제
                </button>
              ) : (
                <button
                  onClick={onConnectYt}
                  className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                >
                  ▶️ YouTube 연결
                </button>
              )}
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
