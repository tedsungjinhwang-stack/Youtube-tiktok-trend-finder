'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  addChannelAction,
  deleteChannelAction,
  scrapeChannelAction,
} from './actions';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';

export type ChannelRow = {
  id: string;
  platform: Platform;
  externalId: string;
  handle: string | null;
  displayName: string | null;
  folder: string;
  folderId: string;
  subscriberCount: number | null;
  lastScrapedAt: Date | null;
};

const PLATFORMS: { v: Platform | 'ALL'; label: string }[] = [
  { v: 'ALL', label: '전체' },
  { v: 'YOUTUBE', label: 'YouTube' },
  { v: 'TIKTOK', label: 'TikTok' },
  { v: 'INSTAGRAM', label: 'Instagram' },
  { v: 'XIAOHONGSHU', label: '샤오홍수' },
  { v: 'DOUYIN', label: '도우인' },
];

export function ChannelsClient({
  channels,
  folders,
}: {
  channels: ChannelRow[];
  folders: { id: string; name: string }[];
}) {
  const [tab, setTab] = useState<Platform | 'ALL'>('ALL');
  const filtered =
    tab === 'ALL' ? channels : channels.filter((c) => c.platform === tab);

  return (
    <>
      <div className="mb-3 flex items-center justify-end text-[13.5px]">
        <button
          onClick={() => downloadCsv(filtered, tab)}
          disabled={filtered.length === 0}
          className="rounded-lg border bg-card px-3 py-1.5 hover:border-foreground/40 disabled:opacity-40"
        >
          CSV 내보내기 ({filtered.length})
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {PLATFORMS.map((p) => {
          const count =
            p.v === 'ALL'
              ? channels.length
              : channels.filter((c) => c.platform === p.v).length;
          return (
            <button
              key={p.v}
              onClick={() => setTab(p.v)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-[14px] transition',
                tab === p.v
                  ? 'border-foreground font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
              <span className="num ml-1.5 text-[12px] text-muted-foreground">
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'ALL' ? (
        PLATFORMS.filter((p) => p.v !== 'ALL').map((p) => (
          <PlatformBlock
            key={p.v}
            platform={p.v as Platform}
            label={p.label}
            list={channels.filter((c) => c.platform === p.v)}
            folders={folders}
          />
        ))
      ) : (
        <PlatformBlock
          platform={tab}
          label={PLATFORMS.find((p) => p.v === tab)!.label}
          list={filtered}
          folders={folders}
          expandedAlways
        />
      )}
    </>
  );
}

function PlatformBlock({
  platform,
  label,
  list,
  folders,
  expandedAlways,
}: {
  platform: Platform;
  label: string;
  list: ChannelRow[];
  folders: { id: string; name: string }[];
  expandedAlways?: boolean;
}) {
  const folderMap = list.reduce<Record<string, ChannelRow[]>>((acc, c) => {
    (acc[c.folder] ??= []).push(c);
    return acc;
  }, {});
  const folderEntries = Object.entries(folderMap);

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <PlatformBadge p={platform} />
        <h2 className="text-[15.5px] font-bold">{label}</h2>
        <span className="num text-[12.5px] text-muted-foreground">
          {list.length}개
        </span>
      </div>

      <AddForm platform={platform} folders={folders} />

      {folderEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed py-8 text-center text-[13.5px] text-muted-foreground">
          등록된 {label} 채널 없음.
        </div>
      ) : (
        <div className="space-y-2">
          {folderEntries.map(([folder, items]) => (
            <details
              key={folder}
              open={expandedAlways || items.length <= 4}
              className="group/f overflow-hidden rounded-xl border bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 hover:bg-accent/30">
                <span className="text-muted-foreground/60 transition group-open/f:rotate-90">
                  ▶
                </span>
                <span className="text-[14px] font-semibold">{folder}</span>
                <span className="num text-[12px] text-muted-foreground">
                  ({items.length})
                </span>
              </summary>
              <div className="border-t border-border/60">
                <ul className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c) => (
                    <ChannelItem key={c.id} c={c} />
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function ChannelItem({ c }: { c: ChannelRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onScrape = () => {
    setError(null);
    startTransition(async () => {
      const r = await scrapeChannelAction(c.id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  const onDelete = () => {
    if (!confirm(`"${c.handle ?? c.externalId}" 채널을 삭제할까요?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteChannelAction(c.id);
      if (!r.ok) setError(r.error);
    });
  };

  const display = c.displayName ?? c.handle ?? c.externalId;
  const channelUrl = buildChannelUrl(c);

  // 핸들 영역 자체를 링크로 — 클릭 시 새 탭에서 채널로 이동
  const NameBlock = (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[13.5px] font-medium hover:underline">
        {display}
      </div>
      <div className="num truncate text-[11.5px] text-muted-foreground hover:underline">
        {c.handle ?? c.externalId}
      </div>
      {error && (
        <div className="truncate text-[11px] text-warning" title={error}>
          {error}
        </div>
      )}
    </div>
  );

  return (
    <li className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[12px] font-bold">
        {display.slice(0, 1)}
      </span>
      {channelUrl ? (
        <a
          href={channelUrl}
          target="_blank"
          rel="noreferrer"
          title={`${display} — 새 탭에서 채널 열기`}
          className="min-w-0 flex-1"
        >
          {NameBlock}
        </a>
      ) : (
        NameBlock
      )}
      {c.subscriberCount != null && (
        <div className="num shrink-0 text-[12px] text-muted-foreground">
          {(c.subscriberCount / 1000).toFixed(0)}K
        </div>
      )}
      <button
        onClick={onScrape}
        disabled={isPending}
        title="수동 스크래핑"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 text-[15px] text-muted-foreground hover:border-foreground/40 hover:bg-accent hover:text-foreground disabled:opacity-40"
      >
        {isPending ? '…' : '↻'}
      </button>
      <button
        onClick={onDelete}
        disabled={isPending}
        title="삭제"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border/60 text-[14px] text-muted-foreground hover:border-warning/60 hover:bg-warning/10 hover:text-warning disabled:opacity-40"
      >
        ✕
      </button>
    </li>
  );
}

function buildChannelUrl(c: ChannelRow): string | null {
  // externalId / handle 양쪽 다 활용. handle 우선.
  const raw = c.handle ?? c.externalId;
  if (!raw) return null;

  // YouTube의 externalId가 UC로 시작하는 channelId일 수도 있음
  if (c.platform === 'YOUTUBE') {
    if (c.externalId.startsWith('UC')) {
      return `https://www.youtube.com/channel/${c.externalId}`;
    }
    const handle = raw.startsWith('@') ? raw : `@${raw}`;
    return `https://www.youtube.com/${handle}`;
  }
  if (c.platform === 'TIKTOK') {
    const handle = raw.startsWith('@') ? raw : `@${raw}`;
    return `https://www.tiktok.com/${handle}`;
  }
  if (c.platform === 'INSTAGRAM') {
    const username = raw.replace(/^@/, '');
    return `https://www.instagram.com/${username}/`;
  }
  if (c.platform === 'XIAOHONGSHU') {
    const id = c.externalId.replace(/^@/, '');
    return `https://www.xiaohongshu.com/user/profile/${id}`;
  }
  if (c.platform === 'DOUYIN') {
    const id = c.externalId.replace(/^@/, '');
    return `https://www.douyin.com/user/${id}`;
  }
  return null;
}

function AddForm({
  platform,
  folders,
}: {
  platform: Platform;
  folders: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const placeholders: Record<Platform, string> = {
    YOUTUBE: 'https://youtube.com/@건봉이티비  또는  @건봉이티비',
    TIKTOK: 'https://www.tiktok.com/@ydb_compile  또는  @ydb_compile',
    INSTAGRAM: 'https://www.instagram.com/movie_kr  또는  movie_kr',
    XIAOHONGSHU: 'https://www.xiaohongshu.com/user/profile/{userId}',
    DOUYIN: 'https://www.douyin.com/user/{secUid}',
  };

  const onSubmit = (formData: FormData) => {
    setError(null);
    setSuccess(false);
    formData.set('platform', platform);
    startTransition(async () => {
      const r = await addChannelAction(formData);
      if (!r.ok) setError(r.error);
      else {
        setSuccess(true);
        const form = document.getElementById(`add-form-${platform}`) as HTMLFormElement | null;
        form?.reset();
      }
    });
  };

  if (folders.length === 0) {
    return (
      <div className="mb-3 rounded-xl border border-dashed bg-card p-3 text-[13.5px] text-muted-foreground">
        폴더가 없어 채널 추가 불가 —{' '}
        <a href="/folders" className="underline hover:text-foreground">
          폴더 관리
        </a>
        에서 먼저 추가하세요.
      </div>
    );
  }

  return (
    <form
      id={`add-form-${platform}`}
      action={onSubmit}
      className="mb-3 rounded-xl border bg-card p-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_100px]">
        <input
          name="input"
          type="text"
          placeholder={placeholders[platform]}
          required
          disabled={isPending}
          className="w-full rounded-md border bg-background/40 px-3 py-2 text-[14px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40 disabled:opacity-50"
        />
        <select
          name="folderId"
          required
          disabled={isPending}
          defaultValue=""
          className="rounded-md border bg-background/40 px-3 py-2 text-[14px] outline-none focus:border-foreground/40 disabled:opacity-50"
        >
          <option value="" disabled>
            폴더 선택
          </option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              폴더: {f.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-foreground px-3 py-2 text-[14px] font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          {isPending ? '추가 중…' : '추가'}
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground">
          URL 또는 핸들(@xxx) 어느 형식이든 OK. 붙여넣으면 자동 파싱.
        </span>
        {error && <span className="text-warning">{error}</span>}
        {success && <span className="text-success">추가됨</span>}
      </div>
    </form>
  );
}

function downloadCsv(list: ChannelRow[], scope: Platform | 'ALL') {
  const header = ['platform', 'handle', 'externalId', 'displayName', 'folder', 'subscribers'];
  const rows = list.map((c) => [
    c.platform,
    c.handle ?? '',
    c.externalId,
    c.displayName ?? '',
    c.folder,
    String(c.subscriberCount ?? ''),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  const tag = scope === 'ALL' ? 'all' : scope.toLowerCase();
  a.href = url;
  a.download = `trend-finder_channels_${tag}_${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function PlatformBadge({ p }: { p: Platform }) {
  const map = {
    YOUTUBE: { letter: 'YT', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    TIKTOK: { letter: 'TT', color: 'bg-zinc-200/10 text-zinc-100 border-zinc-300/30' },
    INSTAGRAM: { letter: 'IG', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
    XIAOHONGSHU: { letter: '小', color: 'bg-red-400/20 text-red-300 border-red-400/30' },
    DOUYIN: { letter: '抖', color: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30' },
  } as const;
  const m = map[p];
  return (
    <span
      className={cn(
        'inline-flex h-5 w-7 items-center justify-center rounded border text-[11px] font-black',
        m.color
      )}
    >
      {m.letter}
    </span>
  );
}
