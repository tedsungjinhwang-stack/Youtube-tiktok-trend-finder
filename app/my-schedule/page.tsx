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
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

function toInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MySchedulePage() {
  const [channels, setChannels] = useState<MyChannel[]>([]);
  const [google, setGoogle] = useState<GoogleStatus>({
    connected: false,
    email: null,
    calendarId: null,
  });
  const [loading, setLoading] = useState(true);
  const [setupWarning, setSetupWarning] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // 채널 추가
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newUrl, setNewUrl] = useState('');

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

  const addChannel = async (withYoutube: boolean) => {
    if (!withYoutube && !newName.trim()) return;
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
    setShowAddForm(false);
    refresh();
    if (withYoutube) await connectYoutube(j.data.id);
  };

  const updateChannel = async (id: string, patch: Partial<MyChannel>) => {
    await fetch(`/api/v1/my-schedule/channels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    refresh();
  };

  const removeChannel = async (id: string) => {
    if (!confirm('이 채널과 모든 예약 영상을 삭제할까요?')) return;
    await fetch(`/api/v1/my-schedule/channels/${id}`, { method: 'DELETE' });
    if (expandedId === id) setExpandedId(null);
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

  const disconnectYoutube = async (channelId: string) => {
    if (!confirm('이 채널의 YouTube 연결을 해제할까요?')) return;
    await fetch(`/api/v1/my-schedule/channels/${channelId}/yt`, { method: 'DELETE' });
    refresh();
  };

  const syncGcalAll = async () => {
    const r = await fetch('/api/v1/my-schedule/sync-gcal-all', { method: 'POST' });
    const j = await r.json();
    if (!j.success) alert(j.error?.message ?? '실패');
    else alert(`✓ 캘린더 동기화 완료 (${j.data.synced}/${j.data.total})`);
    refresh();
  };

  const syncYoutubeAll = async () => {
    const r = await fetch('/api/v1/my-schedule/sync-yt-all', { method: 'POST' });
    const j = await r.json();
    if (!j.success) alert(j.error?.message ?? '실패');
    else
      alert(
        `✓ YouTube 동기화 완료 (${j.data.synced}/${j.data.total} 채널, 총 ${j.data.totalVideos}개 영상)`
      );
    refresh();
  };

  const addVideo = async (
    channelId: string,
    title: string,
    when: string,
    notes: string
  ) => {
    if (!when) return;
    const r = await fetch('/api/v1/my-schedule/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId,
        title,
        scheduledAt: new Date(when).toISOString(),
        notes,
      }),
    });
    const j = await r.json();
    if (!j.success) alert(j.error?.message ?? '실패');
    refresh();
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
    if (!confirm('이 예약 영상을 삭제할까요?')) return;
    await fetch(`/api/v1/my-schedule/videos/${id}`, { method: 'DELETE' });
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

      {/* 상단 헤더 */}
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">채널 스케줄</h1>
          <span className="text-xs text-muted-foreground">
            {channels.length}개 채널 (활성 {channels.filter((c) => c.isActive).length}개)
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Google 캘린더 상태 + 동기화 */}
          {google.connected ? (
            <>
              <span className="text-[11px] text-muted-foreground">
                📅 {google.email ?? '연결됨'}
              </span>
              <button
                onClick={syncGcalAll}
                className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                title="활성 채널 전체 캘린더 이벤트 강제 갱신"
              >
                🗓️ 캘린더 동기화
              </button>
              <button
                onClick={syncYoutubeAll}
                className="rounded-md border bg-card px-3 py-1 text-xs hover:border-foreground/40"
                title="활성 + YT 연결 채널 전체 예약 영상 가져오기"
              >
                🔄 YouTube 동기화
              </button>
              <button
                onClick={disconnectGoogle}
                className="rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:border-destructive/40 hover:text-foreground"
              >
                연결 해제
              </button>
            </>
          ) : (
            <button
              onClick={connectGoogle}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Google 캘린더 연결
            </button>
          )}
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className={cn(
              'rounded-md border px-3 py-1 text-xs font-semibold',
              showAddForm
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'bg-card hover:border-foreground/40'
            )}
          >
            + 채널 추가
          </button>
        </div>
      </header>

      {/* 채널 추가 폼 (토글) */}
      {showAddForm && (
        <div className="border-b bg-secondary/30 px-6 py-3">
          <div className="grid grid-cols-12 gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="채널명 (YouTube 연결 시 자동 채움)"
              className="col-span-4 h-9 rounded-md border bg-background px-3 text-sm"
            />
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="카테고리"
              className="col-span-2 h-9 rounded-md border bg-background px-3 text-sm"
            />
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="채널 URL (선택)"
              className="col-span-3 h-9 rounded-md border bg-background px-3 text-sm"
            />
            <button
              onClick={() => addChannel(false)}
              disabled={!newName.trim()}
              className="col-span-1 h-9 rounded-md border bg-card text-xs hover:border-foreground/40 disabled:opacity-40"
            >
              채널만
            </button>
            <button
              onClick={() => addChannel(true)}
              className="col-span-2 h-9 rounded-md border border-primary/40 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/20"
              title="채널 생성 + YouTube OAuth. 이름 비워두면 YouTube 채널명으로 자동 채움"
            >
              + YouTube 연결
            </button>
          </div>
        </div>
      )}

      {/* 채널 리스트 */}
      <div className="flex-1 overflow-auto">
        {channels.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            아직 채널이 없습니다. 우측 상단 "+ 채널 추가" 로 시작하세요.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-[11px] uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="w-[26%] px-4 py-2 text-left font-semibold">채널</th>
                <th className="w-[10%] px-4 py-2 text-left font-semibold">카테고리</th>
                <th className="px-4 py-2 text-left font-semibold">
                  마지막 예약 영상
                </th>
                <th className="w-[14%] px-4 py-2 text-left font-semibold">
                  예약일시
                </th>
                <th className="w-[18%] px-4 py-2 text-right font-semibold">액션</th>
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
                const isExpanded = expandedId === c.id;
                return (
                  <ChannelRow
                    key={c.id}
                    channel={c}
                    last={last}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : c.id)}
                    onUpdate={updateChannel}
                    onRemove={() => removeChannel(c.id)}
                    onConnectYt={() => connectYoutube(c.id)}
                    onDisconnectYt={() => disconnectYoutube(c.id)}
                    onAddVideo={(t, w, n) => addVideo(c.id, t, w, n)}
                    onUpdateVideo={updateVideo}
                    onRemoveVideo={removeVideo}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ChannelRow({
  channel: c,
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
  channel: MyChannel;
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
              title={isExpanded ? '접기' : '펼쳐서 영상 관리'}
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
              <div className="flex gap-2 text-[10px] text-muted-foreground">
                {c.youtubeOauth && (
                  <span title={c.youtubeOauth.accountEmail ?? ''}>
                    ▶️ {c.youtubeOauth.youtubeChannelName ?? 'YT 연결됨'}
                  </span>
                )}
                <span>· {c.videos.length}개 예약</span>
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground">
          {c.category ?? '—'}
        </td>
        <td className="px-4 py-2.5">
          {last ? (
            <div className="truncate text-xs" title={last.title}>
              {last.title || <span className="italic text-muted-foreground">제목 없음</span>}
            </div>
          ) : (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ 영상 없음 — 업로드 필요
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-xs">
          {last ? <span className="font-semibold">{fmt(last.scheduledAt)}</span> : '—'}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex justify-end gap-1">
            {!c.youtubeOauth && (
              <button
                onClick={onConnectYt}
                className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20"
              >
                ▶️ YT
              </button>
            )}
            <button
              onClick={() =>
                onUpdate(c.id, { isActive: !c.isActive } as Partial<MyChannel>)
              }
              className={cn(
                'rounded border px-2 py-1 text-[10px]',
                c.isActive
                  ? 'bg-card hover:border-foreground/40'
                  : 'border-amber-500/40 bg-amber-100/50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
              )}
              title={c.isActive ? '비활성화' : '활성화'}
            >
              {c.isActive ? '⏸️' : '▶️'}
            </button>
            <button
              onClick={onRemove}
              className="rounded border bg-card px-2 py-1 text-[10px] hover:border-destructive/40"
              title="채널 삭제"
            >
              🗑️
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b bg-secondary/20">
          <td colSpan={5} className="px-6 py-3">
            {/* 채널 메타 인라인 편집 */}
            <div className="mb-3 grid grid-cols-12 gap-2">
              <input
                value={c.name}
                onChange={(e) => onUpdate(c.id, { name: e.target.value } as Partial<MyChannel>)}
                onBlur={(e) =>
                  onUpdate(c.id, { name: e.target.value } as Partial<MyChannel>)
                }
                placeholder="채널명"
                className="col-span-4 h-8 rounded border bg-background px-2 text-xs"
              />
              <input
                value={c.category ?? ''}
                onBlur={(e) =>
                  onUpdate(c.id, { category: e.target.value } as Partial<MyChannel>)
                }
                placeholder="카테고리"
                onChange={(e) =>
                  onUpdate(c.id, { category: e.target.value } as Partial<MyChannel>)
                }
                className="col-span-2 h-8 rounded border bg-background px-2 text-xs"
              />
              <input
                value={c.url ?? ''}
                onBlur={(e) =>
                  onUpdate(c.id, { url: e.target.value } as Partial<MyChannel>)
                }
                onChange={(e) =>
                  onUpdate(c.id, { url: e.target.value } as Partial<MyChannel>)
                }
                placeholder="URL"
                className="col-span-4 h-8 rounded border bg-background px-2 text-xs"
              />
              {c.youtubeOauth && (
                <button
                  onClick={onDisconnectYt}
                  className="col-span-2 h-8 rounded border bg-card text-[10.5px] hover:border-destructive/40"
                >
                  YT 연결 해제
                </button>
              )}
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

            {/* 영상 리스트 */}
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
                      onChange={(e) =>
                        onUpdateVideo(v.id, { title: e.target.value })
                      }
                      placeholder="제목 (선택)"
                      className="flex-1 border-none bg-transparent outline-none"
                    />
                    {v.notes && (
                      <span className="truncate text-[10px] text-muted-foreground">
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
