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
        if (!selectedChannelId && c.data?.length > 0) setSelectedChannelId(c.data[0].id);
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

  const disconnectYoutube = async (channelId: string) => {
    if (!confirm('이 채널의 YouTube 연결을 해제할까요? (이미 가져온 영상은 남음)')) return;
    await fetch(`/api/v1/my-schedule/channels/${channelId}/yt`, { method: 'DELETE' });
    refresh();
  };

  const syncGcalAll = async () => {
    const r = await fetch('/api/v1/my-schedule/sync-gcal-all', { method: 'POST' });
    const j = await r.json();
    if (!j.success) alert(j.error?.message ?? '실패');
    else alert(`✓ 캘린더 동기화 완료 (${j.data.synced}/${j.data.total} 채널)`);
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
                onClick={syncGcalAll}
                className="h-7 w-full rounded-md bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                title="활성 채널 전체의 캘린더 이벤트 강제 갱신"
              >
                🗓️ 캘린더 전체 동기화
              </button>
              <button
                onClick={syncYoutubeAll}
                className="h-7 w-full rounded-md border bg-card text-xs hover:border-foreground/40"
                title="YouTube 연결된 활성 채널 전체의 예약 영상 일괄 가져오기"
              >
                🔄 YouTube 전체 동기화
              </button>
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

      {/* 우측: 선택된 채널의 영상 일정 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            왼쪽에서 채널을 선택하거나 새로 추가하세요
          </div>
        ) : (
          <>
            <header className="border-b px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <input
                    value={selected.name}
                    onChange={(e) =>
                      setChannels((prev) =>
                        prev.map((x) => (x.id === selected.id ? { ...x, name: e.target.value } : x))
                      )
                    }
                    onBlur={(e) => updateChannel(selected.id, { name: e.target.value } as Partial<MyChannel>)}
                    className="w-full border-none bg-transparent text-xl font-bold outline-none"
                  />
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                    <input
                      value={selected.category ?? ''}
                      onChange={(e) =>
                        setChannels((prev) =>
                          prev.map((x) =>
                            x.id === selected.id ? { ...x, category: e.target.value } : x
                          )
                        )
                      }
                      onBlur={(e) =>
                        updateChannel(selected.id, { category: e.target.value } as Partial<MyChannel>)
                      }
                      placeholder="카테고리"
                      className="border-none bg-transparent outline-none"
                    />
                    <input
                      value={selected.url ?? ''}
                      onChange={(e) =>
                        setChannels((prev) =>
                          prev.map((x) =>
                            x.id === selected.id ? { ...x, url: e.target.value } : x
                          )
                        )
                      }
                      onBlur={(e) =>
                        updateChannel(selected.id, { url: e.target.value } as Partial<MyChannel>)
                      }
                      placeholder="URL"
                      className="flex-1 border-none bg-transparent outline-none"
                    />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {selected.youtubeOauth ? (
                    <>
                      <div className="text-[10.5px] text-muted-foreground">
                        ▶️ {selected.youtubeOauth.youtubeChannelName ?? selected.youtubeOauth.accountEmail ?? '연결됨'}
                      </div>
                      <button
                        onClick={() => disconnectYoutube(selected.id)}
                        className="rounded-md border bg-card px-2.5 py-1 text-[11px] hover:border-destructive/40"
                      >
                        YT 연결 해제
                      </button>
                      {selected.youtubeOauth.lastSyncError && (
                        <div className="max-w-[240px] text-right text-[10px] text-destructive">
                          ⚠️ {selected.youtubeOauth.lastSyncError}
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => connectYoutube(selected.id)}
                      className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                    >
                      ▶️ YouTube 연결
                    </button>
                  )}
                  <button
                    onClick={() =>
                      updateChannel(selected.id, { isActive: !selected.isActive } as Partial<MyChannel>)
                    }
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-[11px]',
                      selected.isActive
                        ? 'bg-card hover:border-foreground/40'
                        : 'border-amber-500/40 bg-amber-100/50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200'
                    )}
                    title={
                      selected.isActive
                        ? '비활성화 — cron/캘린더 동기화에서 제외 (기존 이벤트는 그대로 유지)'
                        : '활성화 — 동기화 재개'
                    }
                  >
                    {selected.isActive ? '⏸️ 비활성화' : '▶️ 활성화'}
                  </button>
                  <button
                    onClick={() => removeChannel(selected.id)}
                    className="rounded-md border bg-card px-2.5 py-1 text-xs hover:border-destructive/40"
                  >
                    채널 삭제
                  </button>
                </div>
              </div>
            </header>

            {/* 요약: 총 N개 + 마지막 예약 일자 */}
            {(() => {
              const sorted = [...selected.videos].sort(
                (a, b) =>
                  new Date(b.scheduledAt).getTime() -
                  new Date(a.scheduledAt).getTime()
              );
              const last = sorted[0];
              return (
                <div className="border-b bg-background px-6 py-2.5 text-xs">
                  총 <span className="font-bold">{selected.videos.length}</span>개 예약
                  {last && (
                    <>
                      <span className="text-muted-foreground"> · 마지막 예약: </span>
                      <span className="font-semibold">{fmt(last.scheduledAt)}</span>
                    </>
                  )}
                </div>
              );
            })()}

            {/* 영상 추가 폼 */}
            <div className="border-b bg-secondary/30 p-4">
              <div className="grid grid-cols-12 gap-2">
                <input
                  value={vTitle}
                  onChange={(e) => setVTitle(e.target.value)}
                  placeholder="영상 제목 / 컨셉 (선택)"
                  className="col-span-5 h-9 rounded-md border bg-background px-3 text-sm"
                />
                <input
                  type="datetime-local"
                  value={vWhen}
                  onChange={(e) => setVWhen(e.target.value)}
                  className="col-span-3 h-9 rounded-md border bg-background px-3 text-sm"
                />
                <input
                  value={vNotes}
                  onChange={(e) => setVNotes(e.target.value)}
                  placeholder="메모 (선택)"
                  className="col-span-3 h-9 rounded-md border bg-background px-3 text-sm"
                />
                <button
                  onClick={addVideo}
                  disabled={!vWhen}
                  className="col-span-1 h-9 rounded-md bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  + 예약
                </button>
              </div>
              {!google.connected && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  ※ Google 캘린더 미연결 — 추가해도 캘린더에 안 올라감. 좌측 하단에서 연결하세요.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4">
              {selected.videos.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  예약된 영상이 없습니다
                </p>
              ) : (
                <ul className="space-y-2">
                  {selected.videos.map((v) => (
                    <li
                      key={v.id}
                      className="rounded-lg border bg-card p-3 hover:border-foreground/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <input
                            value={v.title}
                            onChange={(e) =>
                              setChannels((prev) =>
                                prev.map((c) =>
                                  c.id === selected.id
                                    ? {
                                        ...c,
                                        videos: c.videos.map((x) =>
                                          x.id === v.id ? { ...x, title: e.target.value } : x
                                        ),
                                      }
                                    : c
                                )
                              )
                            }
                            onBlur={(e) => updateVideo(v.id, { title: e.target.value })}
                            className="w-full border-none bg-transparent text-sm font-semibold outline-none"
                          />
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                            <input
                              type="datetime-local"
                              value={toInputValue(v.scheduledAt)}
                              onChange={(e) =>
                                updateVideo(v.id, {
                                  scheduledAt: new Date(e.target.value).toISOString(),
                                })
                              }
                              className="h-6 rounded border bg-background px-1.5 text-[11px]"
                            />
                            <span>📅 {fmt(v.scheduledAt)}</span>
                            {v.gcalEventId && <span>✓ 캘린더 동기화됨</span>}
                          </div>
                          {(v.notes ?? '') && (
                            <p className="mt-1 text-xs text-muted-foreground">{v.notes}</p>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <select
                            value={v.status}
                            onChange={(e) => updateVideo(v.id, { status: e.target.value })}
                            className="h-7 rounded border bg-background px-1.5 text-[11px]"
                          >
                            <option value="planned">계획</option>
                            <option value="in_progress">제작중</option>
                            <option value="done">완료</option>
                          </select>
                          <button
                            onClick={() => removeVideo(v.id)}
                            className="rounded border bg-background px-2 text-[11px] hover:border-destructive/40"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
      </div>
    </div>
  );
}
