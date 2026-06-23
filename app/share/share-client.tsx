'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addChannelAction, deleteChannelAction } from '../channels/actions';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';
type Kind = 'REFERENCE' | 'SOURCE';
type ShareMode = 'material' | 'channel' | 'community' | 'schedule';
export type CommunityPost = {
  id: string;
  tab: string;
  country: string;
  source: string;
  sourceLabel: string | null;
  rank: number;
  prevRank: number | null;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  commentCount: number | null;
  prevCommentCount: number | null;
  viewCount: number | null;
  prevViewCount: number | null;
  score: number | null;
  prevScore: number | null;
  lang: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
};
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
  community,
  communityLastRunAt,
}: {
  folders: Folder[];
  myChannels: MyChannel[];
  assetChannels: AssetChannel[];
  community: CommunityPost[];
  communityLastRunAt: string | null;
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
        community={community}
        communityLastRunAt={communityLastRunAt}
      />
    </Suspense>
  );
}

function Inner({
  folders,
  myChannels,
  assetChannels,
  community,
  communityLastRunAt,
}: {
  folders: Folder[];
  myChannels: MyChannel[];
  assetChannels: AssetChannel[];
  community: CommunityPost[];
  communityLastRunAt: string | null;
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
      fromUrl === 'community' ||
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
        last === 'community' ||
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
            setMode('community');
            setDone(null);
            setError(null);
          }}
          className={
            'h-10 rounded-md text-[12.5px] font-semibold transition ' +
            (mode === 'community'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          💬 커뮤니티
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

      {mode === 'community' && (
        <CommunityFeed posts={community} lastRunAt={communityLastRunAt} />
      )}
      {mode === 'schedule' && (
        <ScheduleForm myChannels={myChannels} />
      )}
      {mode !== 'community' && mode !== 'schedule' && (

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

/* ─────────── 커뮤니티/뉴스 카드 피드 (share 페이지 내부 인라인) ─────────── */

function CommunityFeed({
  posts,
  lastRunAt,
}: {
  posts: CommunityPost[];
  lastRunAt: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'community' | 'news' | 'reddit'>('community');
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [translated, setTranslated] = useState(false);
  const [tmap, setTmap] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  const counts: Record<string, number> = { community: 0, news: 0, reddit: 0 };
  for (const p of posts) counts[p.tab] = (counts[p.tab] ?? 0) + 1;

  const visible = posts
    .filter((p) => p.tab === tab)
    .sort((a, b) => {
      const ta = new Date(a.firstSeenAt).getTime();
      const tb = new Date(b.firstSeenAt).getTime();
      if (Math.abs(tb - ta) < 60_000) return a.rank - b.rank;
      return tb - ta;
    });

  const hasForeign = posts.some((p) => p.lang && p.lang !== 'ko');

  async function runNow() {
    if (running) return;
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch('/api/v1/discovery/run', { method: 'POST' });
      const txt = await res.text();
      let data: { success?: boolean; data?: { saved: number }; error?: { message?: string } } | null = null;
      try { data = JSON.parse(txt); } catch {}
      if (!res.ok || !data?.success) {
        setRunMsg(`❌ ${data?.error?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setRunMsg(`✅ ${data.data!.saved}건 수집됨`);
      router.refresh();
    } catch (e) {
      setRunMsg(`❌ ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function toggleTranslate() {
    if (translated) {
      setTranslated(false);
      return;
    }
    const need = posts.filter((p) => p.lang && p.lang !== 'ko' && !tmap[p.id]);
    if (need.length === 0) {
      setTranslated(true);
      return;
    }
    setTranslating(true);
    try {
      const byLang = new Map<string, CommunityPost[]>();
      for (const p of need) {
        const arr = byLang.get(p.lang!) ?? [];
        arr.push(p);
        byLang.set(p.lang!, arr);
      }
      const next: Record<string, string> = {};
      for (const [lang, items] of byLang) {
        const r = await fetch('/api/v1/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: items.map((i) => i.title), sl: lang, tl: 'ko' }),
        });
        const d = (await r.json()) as { translations?: string[] };
        (d.translations ?? []).forEach((t, idx) => {
          if (t) next[items[idx].id] = t;
        });
      }
      setTmap((m) => ({ ...m, ...next }));
      setTranslated(true);
    } catch {
      alert('번역 실패');
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div>
      {/* 상단 액션 */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          {lastRunAt
            ? `마지막 수집 · ${cfFormatRelative(new Date(lastRunAt))}`
            : '수집된 데이터 없음'}
        </p>
        <div className="flex gap-1.5">
          <button
            onClick={runNow}
            disabled={running}
            className="grid h-9 w-9 place-items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 active:bg-emerald-500/20 disabled:opacity-50"
            aria-label="수집"
            title="수동 수집"
          >
            {running ? '…' : '🔄'}
          </button>
          {hasForeign && (
            <button
              onClick={toggleTranslate}
              disabled={translating}
              className={`grid h-9 w-9 place-items-center rounded-full border active:bg-accent disabled:opacity-50 ${
                translated ? 'border-blue-500 bg-blue-500/15 text-blue-400' : 'border-border'
              }`}
              aria-label="번역"
              title={translated ? '원문 보기' : '한국어 번역'}
            >
              {translating ? '…' : '🌐'}
            </button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="mb-2 flex gap-1 border-b">
        {(['community', 'news', 'reddit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px flex-1 border-b-2 py-2 text-[13px] font-semibold ${
              tab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            {t === 'community' ? '커뮤니티' : t === 'news' ? '뉴스' : '레딧'}
            <span className="ml-1 text-[12px] opacity-60">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>

      {runMsg && (
        <div className="mb-2 rounded-md border bg-accent/40 px-2 py-1.5 text-[12px] text-muted-foreground">
          {runMsg}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-muted-foreground">
          {posts.length === 0 ? '🔄 눌러서 처음 수집해보세요' : '이 탭에 글 없음'}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((r, i) => {
            const title = translated && tmap[r.id] ? tmap[r.id] : r.title;
            const cDelta = cfDelta(r.commentCount, r.prevCommentCount);
            const vDelta = cfDelta(r.viewCount, r.prevViewCount);
            const sDelta = cfDelta(r.score, r.prevScore);
            const ts = r.publishedAt ?? r.firstSeenAt;
            const useFirstSeen = !r.publishedAt;
            return (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-2.5 rounded-xl border bg-card/40 p-2.5 active:bg-accent/60"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center self-start rounded-full bg-secondary text-[12px] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  {r.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span
                      className="grid h-14 w-14 shrink-0 place-items-center rounded-lg text-xl"
                      style={{ backgroundColor: cfColorFor(r.source) + '30' }}
                    >
                      📄
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[14px] font-medium leading-snug">
                      {title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: cfColorFor(r.source) }}
                        />
                        <span className="font-medium">{r.sourceLabel ?? r.source}</span>
                      </span>
                      {r.prevRank == null ? (
                        <span className="rounded bg-pink-500/15 px-1 text-[11px] font-bold text-pink-400">
                          NEW
                        </span>
                      ) : r.prevRank - r.rank > 0 ? (
                        <span className="text-[12px] font-semibold text-emerald-400">
                          ▲{r.prevRank - r.rank}
                        </span>
                      ) : r.prevRank - r.rank < 0 ? (
                        <span className="text-[12px] font-semibold text-rose-400">
                          ▼{r.rank - r.prevRank}
                        </span>
                      ) : null}
                      {ts && (
                        <span className="opacity-70">
                          · {useFirstSeen ? '발견 ' : ''}
                          {cfFormatRelative(new Date(ts))}
                        </span>
                      )}
                    </span>
                    {(r.viewCount != null || r.commentCount != null || r.score != null) && (
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted-foreground">
                        {r.viewCount != null && (
                          <span>
                            👁 {cfFmt(r.viewCount)}
                            {vDelta > 0 && <span className="ml-0.5 text-emerald-400">(+{cfFmt(vDelta)})</span>}
                          </span>
                        )}
                        {r.commentCount != null && (
                          <span>
                            💬 {cfFmt(r.commentCount)}
                            {cDelta > 0 && <span className="ml-0.5 text-emerald-400">(+{cfFmt(cDelta)})</span>}
                          </span>
                        )}
                        {r.score != null && (
                          <span>
                            ▲ {cfFmt(r.score)}
                            {sDelta > 0 && <span className="ml-0.5 text-emerald-400">(+{cfFmt(sDelta)})</span>}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function cfDelta(cur: number | null, prev: number | null | undefined): number {
  if (cur == null || prev == null) return 0;
  return cur - prev;
}
function cfFmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (a >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}
function cfFormatRelative(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return '방금';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
const CF_PALETTE = [
  '#ef4444','#f97316','#eab308','#22c55e','#14b8a6',
  '#3b82f6','#6366f1','#a855f7','#ec4899','#06b6d4',
];
function cfColorFor(source: string): string {
  let h = 0;
  for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) >>> 0;
  return CF_PALETTE[h % CF_PALETTE.length];
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = localStorage.getItem('share-schedule-channel');
    if (last && myChannels.some((c) => c.id === last)) setChannelId(last);
    else if (myChannels[0]) setChannelId(myChannels[0].id);
  }, [myChannels]);

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
          scheduledAt: new Date(when).toISOString(),
          notes: notes.trim(),
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
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
        />
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
  // 내일 16:30 (KST 기준 로컬)
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(16, 30, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function sfFmtKst(local: string): string {
  // datetime-local 입력값 → 'MM/DD HH:mm' 표시용
  const d = new Date(local);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
