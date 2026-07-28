'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addChannelAction, deleteChannelAction } from '../channels/actions';
import { kstLocalToISO, tomorrowKstLocal } from '@/lib/kst';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';
type Kind = 'REFERENCE' | 'SOURCE';
type ShareMode = 'material' | 'channel' | 'schedule';
type Folder = { id: string; name: string };
type Material = { id: string; url: string; createdAt: string };
type MyChannel = {
  id: string;
  name: string;
  category: string | null;
  materials: Material[];
};
type AssetChannel = {
  id: string;
  platform: Platform;
  handle: string | null;
  displayName: string | null;
  externalId: string;
  folderId: string;
  folderName: string;
  kind: Kind;
};

const PLATFORM_LABEL: Record<Platform, string> = {
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  XIAOHONGSHU: '샤오홍수',
  DOUYIN: '도우인',
};

function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0] : '';
}

function detectPlatform(input: string): Platform {
  const s = input.toLowerCase();
  if (/youtu\.?be|youtube\.com/.test(s)) return 'YOUTUBE';
  if (/tiktok\.com/.test(s)) return 'TIKTOK';
  if (/instagram\.com/.test(s)) return 'INSTAGRAM';
  if (/xiaohongshu\.com|xhslink/.test(s)) return 'XIAOHONGSHU';
  if (/douyin\.com|iesdouyin/.test(s)) return 'DOUYIN';
  return 'YOUTUBE';
}

export function ShareClient({
  folders,
  myChannels,
  assetChannels,
}: {
  folders: Folder[];
  myChannels: MyChannel[];
  assetChannels: AssetChannel[];
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">
          로딩 중…
        </div>
      }
    >
      <Inner
        folders={folders}
        myChannels={myChannels}
        assetChannels={assetChannels}
      />
    </Suspense>
  );
}

function Inner({
  folders,
  myChannels,
  assetChannels,
}: {
  folders: Folder[];
  myChannels: MyChannel[];
  assetChannels: AssetChannel[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  // 모드 결정 — URL ?type= 또는 마지막 선택 기억
  const [mode, setMode] = useState<ShareMode>('material');
  useEffect(() => {
    const fromUrl = params.get('type');
    if (
      fromUrl === 'channel' ||
      fromUrl === 'material' ||
      fromUrl === 'schedule'
    ) {
      setMode(fromUrl);
      return;
    }
    if (typeof window !== 'undefined') {
      const last = localStorage.getItem('share-mode');
      if (
        last === 'channel' ||
        last === 'material' ||
        last === 'schedule'
      ) {
        setMode(last as ShareMode);
      }
    }
  }, [params]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('share-mode', mode);
    }
  }, [mode]);

  // 공유받은 URL/텍스트
  const sharedText = useMemo(() => {
    const direct = params.get('url') ?? '';
    if (direct) return direct;
    const text = params.get('text') ?? '';
    const title = params.get('title') ?? '';
    return extractUrl(text) || extractUrl(title) || text || title;
  }, [params]);

  const [input, setInput] = useState('');
  useEffect(() => {
    if (sharedText) setInput(sharedText);
  }, [sharedText]);

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 소재 모드 상태
  const [matChannelId, setMatChannelId] = useState<string>('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = localStorage.getItem('share-last-channel');
    if (last && myChannels.some((c) => c.id === last)) setMatChannelId(last);
    else if (myChannels[0]) setMatChannelId(myChannels[0].id);
  }, [myChannels]);

  // 에셋 채널 모드 상태
  const [platform, setPlatform] = useState<Platform>('YOUTUBE');
  const [folderId, setFolderId] = useState<string>('');
  const [kind, setKind] = useState<Kind>('REFERENCE');
  const [platformLocked, setPlatformLocked] = useState(false);
  useEffect(() => {
    if (!platformLocked && input) setPlatform(detectPlatform(input));
  }, [input, platformLocked]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lastFolder = localStorage.getItem('channels-share-folder');
    const lastKind = localStorage.getItem('channels-share-kind');
    if (lastFolder && folders.some((f) => f.id === lastFolder)) setFolderId(lastFolder);
    else if (folders[0]) setFolderId(folders[0].id);
    if (lastKind === 'SOURCE' || lastKind === 'REFERENCE') setKind(lastKind);
  }, [folders]);

  const submitMaterial = async () => {
    if (!matChannelId || !input.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/v1/my-schedule/channels/${matChannelId}/materials`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input.trim() }),
        }
      );
      const j = await r.json();
      if (j.success) {
        localStorage.setItem('share-last-channel', matChannelId);
        const name = myChannels.find((c) => c.id === matChannelId)?.name ?? '채널';
        setDone(`"${name}" 에 소재 추가됨`);
        setInput('');
        router.refresh();
      } else {
        setError(j.error?.message ?? '실패');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitChannel = async () => {
    if (!input.trim() || !folderId) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('input', input.trim());
      fd.set('folderId', folderId);
      fd.set('platform', platform);
      fd.set('kind', kind);
      const r = await addChannelAction(fd);
      if (r.ok) {
        localStorage.setItem('channels-share-folder', folderId);
        localStorage.setItem('channels-share-kind', kind);
        const folderName = folders.find((f) => f.id === folderId)?.name ?? '폴더';
        setDone(
          `"${folderName}" 에 ${kind === 'SOURCE' ? '원본 소스' : '레퍼런스'} 채널 추가됨`
        );
        setInput('');
        router.refresh();
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = mode === 'material' ? submitMaterial : submitChannel;
  const disabled =
    submitting ||
    !input.trim() ||
    (mode === 'material' ? !matChannelId : !folderId);

  return (
    <div className="mx-auto max-w-lg px-4 py-5 sm:px-5">
      <h1 className="mb-1 text-lg font-bold">빠른 추가</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        URL 을 붙여넣고 어디에 추가할지 선택
      </p>

      {/* 모드 토글 — 4개 칸 */}
      <div className="mb-5 grid grid-cols-4 gap-1 rounded-lg bg-secondary/40 p-1">
        <button
          onClick={() => {
            setMode('material');
            setDone(null);
            setError(null);
          }}
          className={
            'h-10 rounded-md text-[12.5px] font-semibold transition ' +
            (mode === 'material'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          🎬 소재
        </button>
        <button
          onClick={() => {
            setMode('channel');
            setDone(null);
            setError(null);
          }}
          className={
            'h-10 rounded-md text-[12.5px] font-semibold transition ' +
            (mode === 'channel'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          📺 에셋채널
        </button>
        <button
          onClick={() => {
            setMode('schedule');
            setDone(null);
            setError(null);
          }}
          className={
            'h-10 rounded-md text-[12.5px] font-semibold transition ' +
            (mode === 'schedule'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          📅 스케줄
        </button>
      </div>

      {mode === 'schedule' && (
        <ScheduleForm myChannels={myChannels} />
      )}
      {mode !== 'schedule' && (

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">
            {mode === 'material' ? '소재 (URL 또는 메모)' : '채널 URL 또는 핸들 (@xxx)'}
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === 'material'
                ? 'URL 또는 메모를 입력'
                : 'https://youtube.com/@xxx  또는  @xxx'
            }
            inputMode="url"
            autoComplete="off"
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          />
        </label>

        {mode === 'material' ? (
          myChannels.length === 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              내 채널이 없습니다.{' '}
              <a href="/my-schedule" className="underline">
                /my-schedule
              </a>{' '}
              에서 먼저 채널을 추가하세요.
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold">내 채널</span>
                <select
                  value={matChannelId}
                  onChange={(e) => setMatChannelId(e.target.value)}
                  className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {myChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.category ? ` · ${c.category}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <MaterialsList
                channelId={matChannelId}
                initial={
                  myChannels.find((c) => c.id === matChannelId)?.materials ?? []
                }
              />
            </>
          )
        ) : folders.length === 0 ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            폴더가 없습니다.{' '}
            <a href="/folders" className="underline">
              먼저 폴더를 만드세요
            </a>
            .
          </div>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">플랫폼</span>
              <select
                value={platform}
                onChange={(e) => {
                  setPlatform(e.target.value as Platform);
                  setPlatformLocked(true);
                }}
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              >
                {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold">종류</span>
              <div className="grid grid-cols-2 gap-2">
                {(['REFERENCE', 'SOURCE'] as Kind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={
                      'h-11 rounded-md border text-sm font-semibold ' +
                      (kind === k
                        ? k === 'SOURCE'
                          ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        : 'border-border/60 bg-background text-muted-foreground')
                    }
                  >
                    {k === 'SOURCE' ? '원본 소스' : '레퍼런스'}
                  </button>
                ))}
              </div>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold">폴더</span>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              >
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            <AssetChannelsList
              channels={assetChannels.filter(
                (c) => c.folderId === folderId && c.kind === kind
              )}
              folderName={folders.find((f) => f.id === folderId)?.name ?? ''}
              kind={kind}
            />
          </>
        )}

        <button
          onClick={submit}
          disabled={disabled}
          className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {submitting
            ? '추가 중…'
            : mode === 'material'
              ? '+ 소재 추가'
              : '+ 채널 추가'}
        </button>

        {done && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            ✓ {done}
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setDone(null)}
                className="h-8 flex-1 rounded border bg-background text-[13px]"
              >
                하나 더 추가
              </button>
              <button
                onClick={() =>
                  router.push(mode === 'material' ? '/my-schedule' : '/channels')
                }
                className="h-8 flex-1 rounded border bg-background text-[13px]"
              >
                목록 보기
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-200">
            ⚠️ {error}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function MaterialsList({
  channelId,
  initial,
}: {
  channelId: string;
  initial: Material[];
}) {
  const [items, setItems] = useState<Material[]>(initial);
  useEffect(() => {
    setItems(initial);
  }, [channelId, initial]);

  const removeAt = async (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    await fetch(`/api/v1/my-schedule/materials/${id}`, {
      method: 'DELETE',
    }).catch(() => {});
  };

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-card/40 p-3 text-center text-[13px] text-muted-foreground">
        이 채널 소재 없음
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border bg-card/40 p-2">
      <div className="px-1 text-[13px] font-semibold text-muted-foreground">
        현재 소재 ({items.length})
      </div>
      {items.map((m, i) => {
        const isUrl = /^https?:\/\//i.test(m.url);
        return (
          <div
            key={m.id}
            className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1.5"
          >
            <span className="num shrink-0 text-[12px] font-bold text-muted-foreground">
              {i + 1}
            </span>
            {isUrl ? (
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[13px] hover:underline"
                title={m.url}
              >
                {m.url}
              </a>
            ) : (
              <span
                className="min-w-0 flex-1 truncate text-[13px]"
                title={m.url}
              >
                {m.url}
              </span>
            )}
            <button
              onClick={() => removeAt(m.id)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="삭제"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

const PLATFORM_BADGE: Record<Platform, { label: string; color: string }> = {
  YOUTUBE: { label: 'YT', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  TIKTOK: { label: 'TT', color: 'bg-zinc-200/10 text-zinc-100 border-zinc-300/30' },
  INSTAGRAM: { label: 'IG', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  XIAOHONGSHU: { label: '小', color: 'bg-red-400/20 text-red-300 border-red-400/30' },
  DOUYIN: { label: '抖', color: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30' },
};

function buildAssetUrl(c: AssetChannel): string | null {
  const h = c.handle?.replace(/^@/, '') || c.externalId;
  switch (c.platform) {
    case 'YOUTUBE':
      return c.externalId.startsWith('UC')
        ? `https://www.youtube.com/channel/${c.externalId}`
        : `https://www.youtube.com/@${h}`;
    case 'TIKTOK':
      return `https://www.tiktok.com/@${h}`;
    case 'INSTAGRAM':
      return `https://www.instagram.com/${h}/`;
    case 'XIAOHONGSHU':
      return c.externalId.startsWith('http')
        ? c.externalId
        : `https://www.xiaohongshu.com/user/profile/${c.externalId}`;
    case 'DOUYIN':
      return c.externalId.startsWith('http')
        ? c.externalId
        : `https://www.douyin.com/user/${c.externalId}`;
    default:
      return null;
  }
}

function AssetChannelsList({
  channels,
  folderName,
  kind,
}: {
  channels: AssetChannel[];
  folderName: string;
  kind: Kind;
}) {
  const router = useRouter();
  const [items, setItems] = useState<AssetChannel[]>(channels);
  useEffect(() => {
    setItems(channels);
  }, [channels]);

  const remove = async (id: string) => {
    if (!confirm('이 채널을 삭제할까요?')) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
    await deleteChannelAction(id).catch(() => {});
    router.refresh();
  };

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-card/40 p-3 text-center text-[13px] text-muted-foreground">
        {folderName ? `"${folderName}" · ${kind === 'SOURCE' ? '원본' : '레퍼'} 채널 없음` : '폴더를 선택하세요'}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border bg-card/40 p-2">
      <div className="px-1 text-[13px] font-semibold text-muted-foreground">
        현재 채널 ({items.length})
      </div>
      {items.map((c) => {
        const badge = PLATFORM_BADGE[c.platform];
        const url = buildAssetUrl(c);
        const display = c.displayName ?? c.handle ?? c.externalId;
        return (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded border bg-background/60 px-2 py-1.5"
          >
            <span
              className={
                'inline-flex h-5 w-7 shrink-0 items-center justify-center rounded border text-[12px] font-bold ' +
                badge.color
              }
            >
              {badge.label}
            </span>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[13px] hover:underline"
                title={display}
              >
                {display}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-[13px]">{display}</span>
            )}
            <button
              onClick={() => remove(c.id)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="삭제"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}


/* ─────────── 채널 스케줄: 채널 선택 + 예약일시 + 저장 ─────────── */

function ScheduleForm({ myChannels }: { myChannels: MyChannel[] }) {
  const router = useRouter();
  const [channelId, setChannelId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(sfDefaultWhen());
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = localStorage.getItem('share-schedule-channel');
    if (last && myChannels.some((c) => c.id === last)) setChannelId(last);
    else if (myChannels[0]) setChannelId(myChannels[0].id);
  }, [myChannels]);

  const syncCalendar = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch('/api/v1/my-schedule/sync-gcal-all', { method: 'POST' });
      const j = await r.json();
      if (!r.ok || !j.success) {
        setSyncMsg(`❌ ${j.error?.message ?? `HTTP ${r.status}`}`);
        return;
      }
      setSyncMsg(`✅ 캘린더 동기화 완료 (${j.data.synced}/${j.data.total} 채널)`);
    } catch (e) {
      setSyncMsg(`❌ ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const submit = async () => {
    if (!channelId || !when) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/my-schedule/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          title: title.trim(),
          scheduledAt: kstLocalToISO(when),
          notes: notes.trim(),
          replace: true, // 빠른추가는 채널당 1예약 — 기존 미래 예약 대체
        }),
      });
      const j = await r.json();
      if (j.success) {
        localStorage.setItem('share-schedule-channel', channelId);
        const name = myChannels.find((c) => c.id === channelId)?.name ?? '채널';
        setDone(`"${name}" 에 ${sfFmtKst(when)} 예약 추가됨`);
        setTitle('');
        setNotes('');
        setWhen(sfDefaultWhen());
        router.refresh();
      } else {
        setError(j.error?.message ?? '실패');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (myChannels.length === 0) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        내 채널이 없습니다.{' '}
        <a href="/my-schedule" className="underline">/my-schedule</a> 에서 먼저 채널을 추가하세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold">채널</span>
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
        >
          {myChannels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.category ? ` · ${c.category}` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold">예약일시</span>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => setWhen((w) => toggleAmPm(w))}
            className="h-11 shrink-0 rounded-md border bg-card px-3 text-sm font-semibold hover:border-foreground/40"
            title="오전 07:00 ↔ 오후 16:30 토글"
          >
            {isAm(when) ? '오전' : '오후'}
          </button>
        </div>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold">제목 (선택)</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="영상 제목"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold">메모 (선택)</span>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="메모"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
        />
      </label>

      <button
        onClick={submit}
        disabled={submitting || !channelId || !when}
        className="h-12 w-full rounded-md bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? '저장 중…' : '📅 예약 저장'}
      </button>

      {/* 수동 캘린더 동기화 */}
      <div className="flex items-center gap-2">
        <button
          onClick={syncCalendar}
          disabled={syncing}
          className="h-10 flex-1 rounded-md border bg-card text-[13px] font-semibold hover:border-foreground/40 disabled:opacity-50"
          title="활성 채널 예약 전부를 Google 캘린더에 반영"
        >
          {syncing ? '동기화 중…' : '🗓️ 캘린더 수동 동기화'}
        </button>
      </div>
      {syncMsg && (
        <p className="text-[12px] text-muted-foreground">{syncMsg}</p>
      )}

      {done && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          ✓ {done}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setDone(null)}
              className="h-8 flex-1 rounded border bg-background text-[13px]"
            >
              하나 더 추가
            </button>
            <button
              onClick={() => router.push('/my-schedule')}
              className="h-8 flex-1 rounded border bg-background text-[13px]"
            >
              스케줄 보기
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-200">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

function sfDefaultWhen(): string {
  // 내일 16:30 (KST)
  return tomorrowKstLocal(16, 30);
}
function sfFmtKst(local: string): string {
  // local 은 이미 KST 벽시계 문자열("YYYY-MM-DDTHH:mm") → 파싱 없이 직접 표시
  if (!local || local.length < 16) return local;
  return `${local.slice(5, 7)}/${local.slice(8, 10)} ${local.slice(11, 16)}`;
}

/** datetime-local 문자열의 시각이 오전(12시 미만)인지 */
function isAm(local: string): boolean {
  const h = Number(local.slice(11, 13));
  return Number.isFinite(h) && h < 12;
}

/** 오전(07:00) ↔ 오후(16:30) 토글. 날짜는 유지, 시:분만 교체 */
function toggleAmPm(local: string): string {
  if (!local || local.length < 16) return local;
  const datePart = local.slice(0, 10);
  return isAm(local) ? `${datePart}T16:30` : `${datePart}T07:00`;
}
