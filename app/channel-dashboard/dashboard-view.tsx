'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { kstLocalToISO, isoToKstLocal, tomorrowKstLocal } from '@/lib/kst';
import { DashboardSummary } from './dashboard-summary';
import { platformStyle } from '@/lib/platform-style';
import {
  GROUP_LABEL,
  GROUP_PLATFORMS,
  GROUP_UNIT,
  type DashboardGroup,
} from '@/lib/todoist-groups';

type ScheduledVideo = {
  id: string;
  channelId: string;
  title: string;
  notes: string | null;
  scheduledAt: string;
  status: string;
  publishedUrl?: string | null;
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

type ChannelAttachment = {
  id: string;
  channelId: string;
  url: string;
  label: string | null;
  createdAt: string;
};

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'THREADS' | 'NAVER_CLIP';

const PLATFORM_LABEL: Record<Platform, string> = {
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  THREADS: 'Threads',
  NAVER_CLIP: '네이버클립',
};
const PLATFORM_ORDER: Platform[] = ['YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'FACEBOOK', 'THREADS', 'NAVER_CLIP'];

type MyChannel = {
  id: string;
  name: string;
  platform: Platform;
  category: string | null;
  url: string | null;
  adsense: string | null;
  email: string | null;
  phone: string | null;
  sortOrder: number;
  isActive: boolean;
  todoistGroup?: string | null;
  videos: ScheduledVideo[];
  youtubeOauth: YtOauth | null;
  materials: ChannelMaterial[];
  attachments: ChannelAttachment[];
};

type TodoistStatus = {
  connected: boolean;
  account?: string | null;
  projectName?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
};

function fmt(iso: string): string {
  // 항상 KST 기준 표시
  return isoToKstLocal(iso).replace('T', ' ');
}

function toInputValue(iso: string): string {
  // datetime-local input 형식: YYYY-MM-DDTHH:mm (항상 KST 기준)
  return isoToKstLocal(iso);
}

export function DashboardView({ group }: { group: DashboardGroup }) {
  const groupLabel = GROUP_LABEL[group];
  const groupPlatforms = GROUP_PLATFORMS[group];
  const unit = GROUP_UNIT[group]; // '채널' | '계정'
  const [channels, setChannels] = useState<MyChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [todoist, setTodoist] = useState<TodoistStatus>({ connected: false });
  const [tdToken, setTdToken] = useState('');
  const [tdBusy, setTdBusy] = useState(false);
  const [tdMsg, setTdMsg] = useState<string | null>(null);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupWarning, setSetupWarning] = useState<string | null>(null);

  // 채널 추가 폼
  const [newName, setNewName] = useState('');
  const [newPlatform, setNewPlatform] = useState<Platform>(
    (GROUP_PLATFORMS[group][0] as Platform) ?? 'YOUTUBE'
  );
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
      const [c, t] = await Promise.all([
        fetch('/api/v1/my-schedule/channels', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/v1/todoist/config', { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => ({ success: false })),
      ]);
      if (c.success) {
        const rows: MyChannel[] = c.data ?? [];
        setChannels(rows.filter((ch) => groupPlatforms.includes(ch.platform ?? 'YOUTUBE')));
        setSetupWarning(c.warning ?? null);
      } else {
        setSetupWarning(c.error?.message ?? `${unit} 목록 로드 실패`);
      }
      if (t.success) setTodoist(t.data);
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
      body: JSON.stringify({
        name: newName,
        platform: newPlatform,
        todoistGroup: group,
        category: newCategory,
        url: newUrl,
      }),
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
    if (!confirm(`이 ${unit}과 모든 예약 영상을 삭제할까요?`)) return;
    try {
      const res = await fetch(`/api/v1/my-schedule/channels/${id}`, {
        method: 'DELETE',
      });
      const text = await res.text();
      let data: { success?: boolean; error?: { message?: string } } | null = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok || data?.success === false) {
        alert(`삭제 실패 (HTTP ${res.status}): ${data?.error?.message ?? text.slice(0, 200)}`);
        return;
      }
      if (selectedChannelId === id) setSelectedChannelId(null);
      refresh();
    } catch (e) {
      alert(`삭제 중 네트워크 오류: ${(e as Error).message}`);
    }
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
        scheduledAt: kstLocalToISO(vWhen),
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

  const addAttachment = async (channelId: string, file: File) => {
    if (!file) return;
    const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    if (!cloud || !preset) {
      alert(
        'Cloudinary 미설정 — Vercel 에 NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET 추가 후 재배포 필요'
      );
      return;
    }
    // 1) 브라우저 → Cloudinary 직접 업로드 (Vercel 4MB 한도 우회)
    const fd = new FormData();
    fd.set('file', file);
    fd.set('upload_preset', preset);
    const upRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud}/auto/upload`,
      { method: 'POST', body: fd }
    );
    const upJson = await upRes.json();
    if (!upRes.ok || !upJson.secure_url) {
      alert('업로드 실패: ' + (upJson.error?.message ?? upRes.status));
      return;
    }
    // 2) 우리 서버엔 URL 만 등록
    const r = await fetch(`/api/v1/my-schedule/channels/${channelId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: upJson.secure_url, label: file.name }),
    });
    const j = await r.json();
    if (j.success) refresh();
    else alert(j.error?.message ?? '등록 실패');
  };

  const removeAttachment = async (id: string) => {
    await fetch(`/api/v1/my-schedule/attachments/${id}`, { method: 'DELETE' });
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
          scheduledAt: kstLocalToISO(bulkWhen),
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
        `${ids.length}개 ${unit}의 예약 영상을 모두 삭제하고 "업로드 필요" 상태로 만들까요?`
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

  const connectTodoist = async () => {
    const token = tdToken.trim();
    if (!token) return;
    setTdBusy(true);
    setTdMsg(null);
    try {
      const r = await fetch('/api/v1/todoist/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: token }),
      });
      const j = await r.json();
      if (j.success) {
        setTdToken('');
        setTdMsg('연결됨');
        refresh();
      } else {
        setTdMsg(`연결 실패: ${j.error?.message ?? ''}`);
      }
    } finally {
      setTdBusy(false);
    }
  };

  const disconnectTodoist = async () => {
    if (!confirm('Todoist 연결을 해제할까요? (Todoist 에 만든 태스크는 남음)')) return;
    await fetch('/api/v1/todoist/config', { method: 'DELETE' });
    setTdMsg(null);
    refresh();
  };

  const syncTodoist = async () => {
    setTdBusy(true);
    setTdMsg('동기화 중…');
    try {
      const r = await fetch('/api/v1/todoist/sync', { method: 'POST' });
      const j = await r.json();
      if (j.success) setTdMsg(`${j.data.tasks}개 태스크 · ${j.data.channels}개 ${unit} 동기화됨`);
      else setTdMsg(`동기화 실패: ${j.error?.message ?? ''}`);
    } catch (e) {
      setTdMsg(`동기화 실패: ${(e as Error).message}`);
    } finally {
      setTdBusy(false);
      refresh();
    }
  };

  const [syncingGcal, setSyncingGcal] = useState(false);

  const syncGcalAll = async () => {
    setSyncingGcal(true);
    try {
      const r = await fetch('/api/v1/todoist/sync', { method: 'POST' });
      const j = await r.json();
      if (!j.success) alert(j.error?.message ?? '실패');
      else alert(`Todoist 동기화 완료 (${j.data.tasks}개 태스크 · ${j.data.channels}개 ${unit})`);
      refresh();
    } finally {
      setSyncingGcal(false);
    }
  };


  if (loading) {
    return <div className="p-8 text-[15px] text-muted-foreground">로딩 중…</div>;
  }

  // 대시보드 요약용 (마지막=가장 미래 예약)
  const summaryChannels = channels
    .filter((c) => c.isActive)
    .map((c) => {
      const future = [...c.videos].sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      );
      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        category: c.category,
        lastScheduledAt: future[0]?.scheduledAt ?? null,
      };
    });

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-6">
      {setupWarning && (
        <div className="surface-warn mb-4 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {setupWarning}
        </div>
      )}
      {syncingGcal && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[13px] font-semibold text-brand">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          Todoist 전체 동기화 진행 중… (활성 {unit} 모두 처리)
        </div>
      )}

      {/* 페이지 헤더 */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{groupLabel} 대시보드</h1>
          <p className="mt-1.5 text-[13px] font-semibold text-muted-foreground">
            {groupPlatforms.map((p) => PLATFORM_LABEL[p as Platform] ?? p).join(' · ')} — {unit}별 마지막 발행 예약
          </p>
        </div>
        <div className="flex items-center gap-2">
          {todoist.connected && (
            <button
              onClick={syncTodoist}
              disabled={tdBusy}
              className="h-9 rounded-lg border border-input px-3.5 text-[13px] font-bold text-foreground hover:border-[color:var(--border-hover)] disabled:opacity-50"
            >
              {tdBusy ? '동기화 중…' : 'Todoist 동기화'}
            </button>
          )}
          <button
            onClick={() => setShowAddChannel((v) => !v)}
            className="h-9 rounded-lg bg-brand px-3.5 text-[13px] font-bold text-brand-foreground hover:opacity-90"
          >
            + {unit} 추가
          </button>
        </div>
      </div>

      {/* 채널 추가 폼 (토글) */}
      {showAddChannel && (
        <div className="mb-4 grid gap-2 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[150px_1fr_1fr_170px_110px]">
          <select
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value as Platform)}
            className="h-9 rounded-lg border border-input bg-[color:var(--surface-input)] px-2 text-[13px]"
          >
            {groupPlatforms.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABEL[p as Platform] ?? p}
              </option>
            ))}
          </select>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`${unit}명 *`}
            className="h-9 rounded-lg border border-input bg-[color:var(--surface-input)] px-2.5 text-[13px]"
          />
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder={`${unit} URL`}
            className="h-9 rounded-lg border border-input bg-[color:var(--surface-input)] px-2.5 text-[13px]"
          />
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="카테고리"
            className="h-9 rounded-lg border border-input bg-[color:var(--surface-input)] px-2.5 text-[13px]"
          />
          <button
            onClick={() => addChannel()}
            disabled={!newName.trim()}
            className="h-9 rounded-lg bg-brand text-[13px] font-bold text-brand-foreground hover:opacity-90 disabled:opacity-40"
          >
            추가
          </button>
        </div>
      )}

      {/* Todoist 미연결 시 안내 */}
      {!todoist.connected && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 text-[13px] font-bold">Todoist 연결</div>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              value={tdToken}
              onChange={(e) => setTdToken(e.target.value)}
              placeholder="Todoist API 토큰 붙여넣기"
              className="h-9 min-w-[240px] flex-1 rounded-lg border border-input bg-[color:var(--surface-input)] px-2.5 text-[13px]"
            />
            <button
              onClick={connectTodoist}
              disabled={tdBusy || !tdToken.trim()}
              className="h-9 rounded-lg bg-brand px-4 text-[13px] font-bold text-brand-foreground hover:opacity-90 disabled:opacity-50"
            >
              연결
            </button>
          </div>
          <a
            href="https://app.todoist.com/app/settings/integrations/developer"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-[11.5px] font-semibold text-muted-foreground underline"
          >
            토큰 발급: Todoist 설정 → 연동 → 개발자
          </a>
          {tdMsg && <p className="mt-1.5 text-[12px] text-muted-foreground">{tdMsg}</p>}
        </div>
      )}
      {todoist.connected && tdMsg && (
        <p className="mb-3 text-[12px] font-semibold text-muted-foreground">{tdMsg}</p>
      )}

      {channels.length > 0 && <DashboardSummary channels={summaryChannels} unit={unit} />}

      <main className="flex flex-col">
        {/* 일괄 작업 툴바 — 채널 1개 이상 선택 시 노출 */}
        {bulkIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/40 bg-primary/10 px-4 py-3 text-sm">
            <span className="rounded bg-primary px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider text-primary-foreground">
              {bulkIds.size}개 선택됨
            </span>
            <button
              onClick={clearBulk}
              className="rounded border bg-card px-2 py-1 text-[13px] text-muted-foreground hover:border-foreground/40"
            >
              선택 해제
            </button>
            <input
              value={bulkTitle}
              onChange={(e) => setBulkTitle(e.target.value)}
              placeholder="제목 (선택)"
              className="h-7 w-48 rounded border bg-background px-2 text-sm"
            />
            <input
              type="datetime-local"
              value={bulkWhen}
              onChange={(e) => setBulkWhen(e.target.value)}
              className="h-7 rounded border bg-background px-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setBulkWhen((w) => toggleAmPmInput(w))}
              className="h-7 shrink-0 rounded border bg-card px-1.5 text-[12px] font-semibold hover:border-foreground/40"
              title="오전 07:00 ↔ 오후 16:30"
            >
              {isAmInput(bulkWhen) ? '오전' : '오후'}
            </button>
            <button
              onClick={bulkAdd}
              disabled={!bulkWhen || bulkBusy}
              className="h-7 rounded-md bg-primary px-3 text-[13px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              + 일괄 예약 추가
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={bulkClear}
              disabled={bulkBusy}
              className="h-7 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 text-[13px] font-bold text-amber-700 hover:bg-amber-500/20 disabled:opacity-40 dark:text-amber-300"
            >
              업로드 필요로 변경 (예약 비우기)
            </button>
            {todoist.connected && (
              <button
                onClick={syncGcalAll}
                disabled={syncingGcal || bulkBusy}
                className="ml-auto h-7 rounded-md border bg-card px-3 text-[13px] hover:border-foreground/40 disabled:opacity-40"
                title="Todoist 전체 동기화"
              >
                {syncingGcal ? '동기화 중…' : 'Todoist 동기화'}
              </button>
            )}
          </div>
        )}
        {bulkIds.size === 0 && todoist.connected && (
          <div className="flex items-center gap-3 border-b bg-secondary/30 px-6 py-3 text-sm">
            <button
              onClick={syncGcalAll}
              disabled={syncingGcal}
              className="rounded-md border bg-card px-3 py-1 hover:border-foreground/40 disabled:opacity-40"
            >
              {syncingGcal ? '동기화 중…' : 'Todoist 전체 동기화'}
            </button>
          </div>
        )}
        {channels.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-14 text-center text-[14px] text-muted-foreground">
            상단 「+ {unit} 추가」로 {unit}을 등록하세요
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[1320px] table-fixed text-[14px]">
              <thead className="bg-[color:var(--surface-table-header)] text-[11.5px] font-bold uppercase tracking-[0.06em] text-[color:var(--text-quaternary)]">
                <tr className="border-b border-border">
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
                  <th className="w-[250px] px-4 py-2 text-left align-top font-semibold">{unit}</th>
                  <th className="w-[130px] px-4 py-2 text-left align-top font-semibold">카테고리</th>
                  <th className="w-[300px] px-4 py-2 text-left align-top font-semibold">소재</th>
                  <th className="w-[220px] px-4 py-2 text-left align-top font-semibold">마지막 예약 영상</th>
                  <th className="w-[170px] px-4 py-2 text-left align-top font-semibold">예약일시</th>
                  <th className="w-[150px] px-4 py-2 text-left align-top font-semibold">완성본 (최대 5)</th>
                  <th className="w-[160px] px-3 py-2 text-right align-top font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c, idx) => {
                  const sorted = [...c.videos].sort(
                    (a, b) =>
                      new Date(b.scheduledAt).getTime() -
                      new Date(a.scheduledAt).getTime()
                  );
                  const last = sorted[0];
                  const isExpanded = selectedChannelId === c.id;
                  const prev = channels[idx - 1];
                  const showHeader =
                    !prev || (prev.platform ?? 'YOUTUBE') !== (c.platform ?? 'YOUTUBE');
                  const countInGroup = channels.filter(
                    (x) => (x.platform ?? 'YOUTUBE') === (c.platform ?? 'YOUTUBE'),
                  ).length;
                  return (
                    <Fragment key={c.id}>
                      {showHeader && (
                        <tr style={{ background: 'var(--surface-group-header)' }}>
                          <td
                            colSpan={8}
                            className="px-4 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[color:var(--text-quaternary)]"
                          >
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="inline-block h-[7px] w-[7px] rounded-full"
                                style={{
                                  background: platformStyle(c.platform ?? 'YOUTUBE').dot,
                                }}
                              />
                              {PLATFORM_LABEL[(c.platform ?? 'YOUTUBE') as Platform]} ·{' '}
                              {countInGroup}{unit}
                            </span>
                          </td>
                        </tr>
                      )}
                      <DashRow
                        c={c}
                        unit={unit}
                        last={last}
                        isExpanded={isExpanded}
                        checked={bulkIds.has(c.id)}
                        onCheck={() => toggleBulk(c.id)}
                        onToggle={() =>
                          setSelectedChannelId(isExpanded ? null : c.id)
                        }
                        onUpdate={updateChannel}
                        onRemove={() => removeChannel(c.id)}
                        onRefresh={refresh}
                        onAddVideo={async (t, w, n) => {
                          if (!w) return;
                          await fetch('/api/v1/my-schedule/videos', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              channelId: c.id,
                              title: t,
                              scheduledAt: kstLocalToISO(w),
                              notes: n,
                            }),
                          });
                          refresh();
                        }}
                        onUpdateVideo={updateVideo}
                        onRemoveVideo={removeVideo}
                        onAddMaterial={(url) => addMaterial(c.id, url)}
                        onRemoveMaterial={removeMaterial}
                        onAddAttachment={(file) => addAttachment(c.id, file)}
                        onRemoveAttachment={removeAttachment}
                      />
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function DashRow({
  c,
  unit,
  last,
  isExpanded,
  checked,
  onCheck,
  onToggle,
  onUpdate,
  onRemove,
  onRefresh,
  onAddVideo,
  onUpdateVideo,
  onRemoveVideo,
  onAddMaterial,
  onRemoveMaterial,
  onAddAttachment,
  onRemoveAttachment,
}: {
  c: MyChannel;
  unit: string;
  last?: ScheduledVideo;
  isExpanded: boolean;
  checked: boolean;
  onCheck: () => void;
  onToggle: () => void;
  onUpdate: (id: string, patch: Partial<MyChannel>) => void;
  onRemove: () => void;
  onRefresh: () => void;
  onAddVideo: (title: string, when: string, notes: string) => void;
  onUpdateVideo: (id: string, patch: Record<string, unknown>) => void;
  onRemoveVideo: (id: string) => void;
  onAddMaterial: (url: string) => void;
  onRemoveMaterial: (id: string) => void;
  onAddAttachment: (file: File) => void;
  onRemoveAttachment: (id: string) => void;
}) {
  const [vTitle, setVTitle] = useState('');
  const [vWhen, setVWhen] = useState('');
  const [vNotes, setVNotes] = useState('');

  // YouTube 연결 (선택) — 연결 없이도 수동 사용 가능
  const [ytBusy, setYtBusy] = useState(false);
  const [ytMsg, setYtMsg] = useState<string | null>(null);
  const [ytPolling, setYtPolling] = useState(false);

  useEffect(() => {
    if (!ytPolling) return;
    if (c.youtubeOauth) {
      setYtPolling(false);
      setYtMsg('YouTube 연결 완료');
      return;
    }
    const iv = setInterval(onRefresh, 2000);
    const to = setTimeout(() => setYtPolling(false), 120_000);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytPolling, c.youtubeOauth]);

  const ytConnect = () => {
    window.open(
      `/api/google/auth/start?kind=youtube&channelId=${c.id}`,
      '_blank',
      'width=520,height=680'
    );
    setYtMsg('팝업에서 Google 계정으로 로그인하면 자동 연결됩니다…');
    setYtPolling(true);
  };

  const ytSync = async () => {
    if (ytBusy) return;
    setYtBusy(true);
    setYtMsg(null);
    try {
      const r = await fetch(`/api/v1/my-schedule/channels/${c.id}/yt`, {
        method: 'POST',
      });
      const j = await r.json();
      if (j.success) setYtMsg(`예약 ${j.data.count}건 동기화됨 (수동 예약은 안 건드림)`);
      else setYtMsg(`동기화 실패: ${j.error?.message ?? ''}`);
    } catch (e) {
      setYtMsg(`동기화 실패: ${(e as Error).message}`);
    } finally {
      setYtBusy(false);
      onRefresh();
    }
  };

  const ytDisconnect = async () => {
    if (!confirm('YouTube 연결을 해제할까요? (기존 예약 데이터는 유지)')) return;
    await fetch(`/api/v1/my-schedule/channels/${c.id}/yt`, { method: 'DELETE' });
    setYtMsg(null);
    onRefresh();
  };

  const sortedAsc = [...c.videos].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );

  return (
    <>
      <tr
        className={cn(
          'group border-b border-border/40 align-top transition-colors hover:bg-accent/20',
          !c.isActive && 'opacity-50',
          isExpanded && 'bg-accent/30',
          checked && 'bg-primary/10'
        )}
      >
        <td className="px-2 py-3 text-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheck}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5"
          />
        </td>
        <td className="px-3 py-3">
          <div className="flex items-start gap-1">
            <button
              onClick={onToggle}
              className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-1.5 truncate">
                <span className="truncate text-[17px] font-bold leading-tight">
                  {c.name}
                </span>
                {!c.isActive && (
                  <span className="rounded bg-muted px-1 py-px text-[12px] font-medium text-muted-foreground">
                    비활성
                  </span>
                )}
              </div>
              <div className="space-y-px rounded-md border border-border/50 bg-background/40 px-2 py-1">
                <ContactRow
                  icon="애드센스"
                  value={c.adsense}
                  placeholder="애드센스 계정"
                  onSave={(v) => onUpdate(c.id, { adsense: v } as Partial<MyChannel>)}
                />
                <ContactRow
                  icon="이메일"
                  value={c.email}
                  placeholder="이메일"
                  onSave={(v) => onUpdate(c.id, { email: v } as Partial<MyChannel>)}
                />
                <ContactRow
                  icon="전화"
                  value={c.phone}
                  placeholder="핸드폰"
                  onSave={(v) => onUpdate(c.id, { phone: v } as Partial<MyChannel>)}
                />
              </div>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 align-top text-sm">
          {c.category ? (
            <span className="inline-block max-w-full truncate whitespace-nowrap rounded-md bg-secondary px-2 py-0.5 text-[12.5px] font-semibold text-[color:var(--text-tertiary)]">
              {c.category}
            </span>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </td>
        <td className="px-4 py-3 align-top text-sm">
          <MaterialsCell
            materials={c.materials}
            onAdd={onAddMaterial}
            onRemove={onRemoveMaterial}
          />
        </td>
        <td className="px-4 py-3 align-top">
          <InlineTitleCell
            last={last}
            count={c.videos.length}
            onSaveExisting={(id, title) => onUpdateVideo(id, { title })}
            onCreate={(title) => onAddVideo(title, todayKstInputValue(), '')}
          />
        </td>
        <td className="px-4 py-3 align-top text-sm">
          <InlineDateCell
            last={last}
            onSaveExisting={(id, iso) => onUpdateVideo(id, { scheduledAt: iso })}
            onCreate={(localStr) => onAddVideo('', localStr, '')}
          />
        </td>
        <td className="px-4 py-3 align-top text-sm">
          <AttachmentsCell
            items={c.attachments}
            onAdd={onAddAttachment}
            onRemove={onRemoveAttachment}
          />
        </td>
        <td className="px-3 py-3 align-top text-sm">
          <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
            {/* 상태 칩 — 예약 유무 */}
            <span
              className="shrink-0 rounded-md px-2 py-1 text-[11.5px] font-bold"
              style={
                !c.isActive
                  ? { background: '#252A2F', color: '#8A939C' }
                  : c.videos.length > 0
                    ? { background: 'rgba(116,190,140,0.13)', color: '#74BE8C' }
                    : { background: 'rgba(217,165,92,0.15)', color: '#D9A55C' }
              }
            >
              {!c.isActive ? '비활성' : c.videos.length > 0 ? '예약됨' : '비어있음'}
            </span>
            {/* 부수 액션 — 행 hover 시에만 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdate(c.id, { isActive: !c.isActive } as Partial<MyChannel>);
              }}
              title={c.isActive ? '비활성화 (항소 중 등 — 대시보드/동기화에서 제외)' : '다시 활성화'}
              className="hover-action shrink-0 rounded-md border border-input px-2 py-1 text-[11.5px] font-bold text-muted-foreground hover:border-[color:var(--border-hover)] hover:text-foreground"
            >
              {c.isActive ? '비활성화' : '활성화'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title={`${unit} 삭제 (예약·소재 모두 삭제)`}
              className="hover-action shrink-0 rounded-md border border-input px-2 py-1 text-[11.5px] font-bold text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              삭제
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b bg-secondary/20">
          <td colSpan={8} className="px-6 py-3">
            {/* 채널 메타 인라인 편집 */}
            <div className="mb-3 grid grid-cols-12 gap-2">
              <select
                value={c.platform ?? 'YOUTUBE'}
                onChange={(e) =>
                  onUpdate(c.id, { platform: e.target.value as Platform } as Partial<MyChannel>)
                }
                className="col-span-2 h-8 rounded border bg-background px-2 text-sm"
              >
                {PLATFORM_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABEL[p]}
                  </option>
                ))}
              </select>
              {/* 여러 대시보드에 보이는 플랫폼(TikTok)은 Todoist 귀속을 직접 지정 */}
              {(c.platform ?? 'YOUTUBE') === 'TIKTOK' && (
                <select
                  value={c.todoistGroup ?? 'youtube'}
                  onChange={(e) =>
                    onUpdate(c.id, { todoistGroup: e.target.value } as Partial<MyChannel>)
                  }
                  title={`이 ${unit}의 Todoist 태스크가 들어갈 프로젝트`}
                  className="col-span-2 h-8 rounded border bg-background px-2 text-sm"
                >
                  <option value="youtube">Todoist: 유튜브</option>
                  <option value="shopping">Todoist: 쇼핑쇼츠</option>
                </select>
              )}
              <input
                value={c.name}
                onChange={(e) => onUpdate(c.id, { name: e.target.value } as Partial<MyChannel>)}
                onBlur={(e) => onUpdate(c.id, { name: e.target.value } as Partial<MyChannel>)}
                placeholder="채널명"
                className="col-span-3 h-8 rounded border bg-background px-2 text-sm"
              />
              <input
                value={c.category ?? ''}
                onChange={(e) => onUpdate(c.id, { category: e.target.value } as Partial<MyChannel>)}
                onBlur={(e) => onUpdate(c.id, { category: e.target.value } as Partial<MyChannel>)}
                placeholder="카테고리"
                className="col-span-2 h-8 rounded border bg-background px-2 text-sm"
              />
              <input
                value={c.url ?? ''}
                onChange={(e) => onUpdate(c.id, { url: e.target.value } as Partial<MyChannel>)}
                onBlur={(e) => onUpdate(c.id, { url: e.target.value } as Partial<MyChannel>)}
                placeholder="URL"
                className="col-span-5 h-8 rounded border bg-background px-2 text-sm"
              />
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  onUpdate(c.id, { isActive: !c.isActive } as Partial<MyChannel>)
                }
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[13px]',
                  c.isActive
                    ? 'bg-card hover:border-foreground/40'
                    : 'border-amber-500/40 bg-amber-100/50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200'
                )}
              >
                {c.isActive ? '비활성화' : '활성화'}
              </button>
              <button
                onClick={onRemove}
                className="rounded-md border bg-card px-2.5 py-1 text-[13px] hover:border-destructive/40"
              >
                {unit} 삭제
              </button>
            </div>

            {/* YouTube 연결 (선택) — 연결하면 예약 업로드가 자동으로 들어옴, 미연결이어도 수동 사용 OK */}
            <div className="mb-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
              {c.youtubeOauth ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="font-semibold text-red-500">▶ YouTube 연결됨</span>
                  <span className="text-muted-foreground">
                    {c.youtubeOauth.youtubeChannelName ?? c.youtubeOauth.accountEmail ?? ''}
                    {c.youtubeOauth.lastSyncedAt &&
                      ` · 마지막 동기화 ${fmt(c.youtubeOauth.lastSyncedAt)}`}
                  </span>
                  {c.youtubeOauth.lastSyncError && (
                    <span className="text-rose-400" title={c.youtubeOauth.lastSyncError}>
                      {c.youtubeOauth.lastSyncError.slice(0, 60)}
                    </span>
                  )}
                  <span className="flex-1" />
                  <button
                    onClick={ytSync}
                    disabled={ytBusy}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[13px] font-semibold text-emerald-500 disabled:opacity-50"
                  >
                    {ytBusy ? '동기화 중…' : '지금 동기화'}
                  </button>
                  <button
                    onClick={ytDisconnect}
                    className="rounded-md border bg-card px-2.5 py-1 text-[12px] text-muted-foreground hover:border-destructive/40"
                  >
                    연결 해제
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="font-semibold text-muted-foreground">▶ YouTube 미연결</span>
                  <span className="text-[12px] text-muted-foreground/70">
                    연결하면 예약 업로드 일정이 자동으로 들어옵니다 (연결 없이 수동 사용도 가능)
                  </span>
                  <span className="flex-1" />
                  <button
                    onClick={ytConnect}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[13px] font-semibold text-red-500 hover:bg-red-500/20"
                  >
                    ▶ YouTube 연결
                  </button>
                </div>
              )}
              {ytMsg && (
                <p className="mt-1 text-[12px] text-muted-foreground">{ytMsg}</p>
              )}
            </div>

            {/* 영상 추가 폼 */}
            <div className="mb-3 grid grid-cols-12 gap-2">
              <input
                value={vTitle}
                onChange={(e) => setVTitle(e.target.value)}
                placeholder="영상 제목 (선택)"
                className="col-span-5 h-8 rounded border bg-background px-2 text-sm"
              />
              <div className="col-span-3 flex items-center gap-1">
                <input
                  type="datetime-local"
                  value={vWhen}
                  onChange={(e) => setVWhen(e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded border bg-background px-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setVWhen((w) => toggleAmPmInput(w))}
                  className="h-8 shrink-0 rounded border bg-card px-1.5 text-[12px] font-semibold hover:border-foreground/40"
                  title="오전 07:00 ↔ 오후 16:30"
                >
                  {isAmInput(vWhen) ? '오전' : '오후'}
                </button>
              </div>
              <input
                value={vNotes}
                onChange={(e) => setVNotes(e.target.value)}
                placeholder="메모 (선택)"
                className="col-span-3 h-8 rounded border bg-background px-2 text-sm"
              />
              <button
                onClick={() => {
                  onAddVideo(vTitle, vWhen, vNotes);
                  setVTitle('');
                  setVWhen('');
                  setVNotes('');
                }}
                disabled={!vWhen}
                className="col-span-1 h-8 rounded bg-primary text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                + 예약
              </button>
            </div>

            {/* 영상 리스트 — 컴팩트 한 줄 */}
            {sortedAsc.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-muted-foreground">
                예약 영상 없음
              </p>
            ) : (
              <ul className="space-y-1">
                {sortedAsc.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-2 rounded border bg-background px-2 py-1.5 text-sm"
                  >
                    <input
                      type="datetime-local"
                      value={toInputValue(v.scheduledAt)}
                      onChange={(e) =>
                        onUpdateVideo(v.id, {
                          scheduledAt: kstLocalToISO(e.target.value),
                        })
                      }
                      className="h-8 w-[170px] rounded border bg-background px-1.5 text-[13px]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateVideo(v.id, {
                          scheduledAt: kstLocalToISO(
                            toggleAmPmInput(toInputValue(v.scheduledAt))
                          ),
                        })
                      }
                      className="h-8 shrink-0 rounded border bg-card px-1.5 text-[12px] font-semibold hover:border-foreground/40"
                      title="오전 07:00 ↔ 오후 16:30"
                    >
                      {isAmInput(toInputValue(v.scheduledAt)) ? '오전' : '오후'}
                    </button>
                    <input
                      value={v.title}
                      onChange={(e) => onUpdateVideo(v.id, { title: e.target.value })}
                      placeholder="제목 (선택)"
                      className="flex-1 border-none bg-transparent outline-none"
                    />
                    {v.notes && (
                      <span
                        className="truncate text-[12px] text-muted-foreground"
                        title={v.notes}
                      >
                        {v.notes}
                      </span>
                    )}
                    {/* 발행 완료 후 실제 게시물 링크 — 전체 현황의 '최근 발행된 글' 에 표시됨 */}
                    <input
                      value={v.publishedUrl ?? ''}
                      onChange={(e) => onUpdateVideo(v.id, { publishedUrl: e.target.value })}
                      placeholder="발행 링크"
                      title="발행 후 게시물 URL 을 넣으면 전체 현황에 표시됩니다"
                      className="h-8 w-[150px] shrink-0 rounded border bg-background px-1.5 text-[12px] text-brand"
                    />
                    {v.publishedUrl && (
                      <a
                        href={v.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded border bg-card px-1.5 py-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                        title="게시물 열기"
                      >
                        열기
                      </a>
                    )}
                    <button
                      onClick={() => onRemoveVideo(v.id)}
                      className="rounded border bg-background px-1.5 text-[12px] hover:border-destructive/40"
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
        className="h-7 w-full rounded border bg-background px-2 text-sm"
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
        <div className="truncate text-sm">
          {last.title || (
            <span className="italic text-muted-foreground">제목 없음</span>
          )}
          <span className="ml-1.5 text-[15px] font-bold">({count})</span>
        </div>
      ) : (
        <span className="block truncate whitespace-nowrap text-[13px] font-semibold text-[#D9A55C]">
          업로드 필요 <span className="text-[14px] font-bold">(0)</span>
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
      const iso = kstLocalToISO(draft);
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
      <DateTimeWithToggle
        autoFocus
        value={draft}
        onChange={setDraft}
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
        className="h-7 rounded border bg-background px-2 text-sm"
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
  // 기본값: 내일 오후 4시 30분 (16:30 KST)
  return tomorrowKstLocal(16, 30);
}

/** datetime-local 문자열이 오전(12시 미만)인지 */
function isAmInput(local: string): boolean {
  const h = Number(local.slice(11, 13));
  return Number.isFinite(h) && h < 12;
}

/** 오전(07:00) ↔ 오후(16:30) 토글. 날짜 유지, 시:분만 교체 */
function toggleAmPmInput(local: string): string {
  if (!local || local.length < 16) {
    // 값 없으면 내일 기준으로 생성
    const base = todayKstInputValue().slice(0, 10);
    return `${base}T07:00`;
  }
  const datePart = local.slice(0, 10);
  return isAmInput(local) ? `${datePart}T16:30` : `${datePart}T07:00`;
}

/** datetime-local + 오전/오후 토글 버튼 묶음 */
function DateTimeWithToggle({
  value,
  onChange,
  className,
  autoFocus,
  onBlur,
  onKeyDown,
  onClick,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus={autoFocus}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onClick={onClick}
        className={className}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onChange(toggleAmPmInput(value));
        }}
        className="h-7 shrink-0 rounded border bg-card px-1.5 text-[12px] font-semibold hover:border-foreground/40"
        title="오전 07:00 ↔ 오후 16:30"
      >
        {isAmInput(value) ? '오전' : '오후'}
      </button>
    </span>
  );
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
          small ? 'h-7 text-[12px]' : 'h-9 text-sm'
        )}
      />
    );
  }

  return (
    <div
      onClick={start}
      className={cn(
        'cursor-text truncate rounded hover:bg-accent/40',
        small ? 'px-1 text-[12px] leading-tight text-muted-foreground' : 'px-1 py-0.5'
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
    <div onClick={(e) => e.stopPropagation()} className="space-y-0.5">
      {materials.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="text-[13px] text-muted-foreground/70 hover:text-foreground"
        >
          + 소재
        </button>
      )}
      {materials.map((m) => {
        const isUrl = /^https?:\/\//i.test(m.url);
        return (
          <label
            key={m.id}
            className="flex items-center gap-1 rounded px-0.5 hover:bg-accent/40"
          >
            <input
              type="checkbox"
              checked={false}
              onChange={() => onRemove(m.id)}
              className="h-2.5 w-2.5 shrink-0"
              title="체크하면 사용 완료 처리되어 사라집니다"
            />
            {isUrl ? (
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-[12px] leading-tight text-blue-600 hover:underline dark:text-blue-400"
                title={m.url}
              >
                {m.url}
              </a>
            ) : (
              <span className="truncate text-[12px] leading-tight" title={m.url}>
                {m.url}
              </span>
            )}
          </label>
        );
      })}
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
            materials.length >= 20
              ? '추가 시 가장 오래된 소재가 삭제됩니다'
              : 'URL 또는 메모'
          }
          className="h-6 w-full rounded border bg-background px-1.5 text-[13px]"
        />
      ) : (
        materials.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="text-[12px] text-muted-foreground/70 hover:text-foreground"
            title={
              materials.length >= 20
                ? '최대 20개 — 추가하면 가장 오래된 소재가 삭제됩니다'
                : '소재 추가 (URL 또는 메모)'
            }
          >
            + 추가{materials.length >= 20 && ' (오래된 것 자동 삭제)'}
          </button>
        )
      )}
    </div>
  );
}

function AttachmentsCell({
  items,
  onAdd,
  onRemove,
}: {
  items: ChannelAttachment[];
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const full = items.length >= 5;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) {
      alert(`파일 너무 큼 (${(f.size / 1024 / 1024).toFixed(1)}MB). 최대 100MB.`);
      return;
    }
    setUploading(true);
    try {
      await Promise.resolve(onAdd(f));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onPick}
        disabled={full || uploading}
      />

      {items.map((a, i) => {
        const name = a.label || a.url;
        const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
        const isVideo = /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(name);
        const icon = isImage ? '이미지' : isVideo ? '영상' : '파일';
        return (
          <div
            key={a.id}
            className="flex items-center gap-1.5 rounded border border-border/40 bg-background/60 px-1.5 py-1"
          >
            <span className="num shrink-0 text-[12px] font-bold text-muted-foreground">
              {i + 1}
            </span>
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-[13px] text-blue-600 hover:underline dark:text-blue-400"
              title={a.label || a.url}
            >
              {icon} {a.label || a.url}
            </a>
            <button
              onClick={() => {
                if (!confirm('이 첨부를 삭제할까요?')) return;
                onRemove(a.id);
              }}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-[13px] font-bold text-destructive hover:bg-destructive/10"
              title="삭제"
              aria-label="삭제"
            >
              ✕
            </button>
          </div>
        );
      })}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={full || uploading}
        className="block w-full truncate whitespace-nowrap rounded border border-dashed border-[color:var(--border-dashed)] px-1.5 py-1 text-left text-[12.5px] font-semibold text-muted-foreground hover:border-[color:var(--border-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title={full ? '최대 5개' : '파일 선택 (영상/이미지 최대 100MB)'}
      >
        {uploading
          ? '업로드 중…'
          : full
            ? '최대 5/5'
            : `파일 추가 (${items.length}/5)`}
      </button>
    </div>
  );
}

function ContactRow({
  icon,
  value,
  placeholder,
  onSave,
}: {
  icon: string;
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
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

  return (
    <div className="flex items-center gap-1.5 text-[13px] leading-tight">
      <span className="shrink-0 text-[12px] opacity-80">{icon}</span>
      {editing ? (
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
          className="h-7 w-full min-w-0 flex-1 rounded border bg-background px-1.5 text-[13px]"
        />
      ) : (
        <button
          onClick={start}
          className="min-w-0 flex-1 truncate text-left hover:text-foreground"
          title={value ?? `${placeholder} (클릭해서 입력)`}
        >
          {value ? (
            <span className="font-medium">{value}</span>
          ) : (
            <span className="text-muted-foreground/50">{placeholder}</span>
          )}
        </button>
      )}
    </div>
  );
}
