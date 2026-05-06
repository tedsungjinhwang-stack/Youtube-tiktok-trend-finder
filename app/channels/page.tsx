'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM';

type ChannelMock = {
  handle: string;
  displayName: string;
  platform: Platform;
  folder: string;
  subscribers: number;
};

const channels: ChannelMock[] = [
  { handle: '@gunbong_tv',  displayName: '건봉이티비',     platform: 'YOUTUBE',   folder: '영드짜',       subscribers: 62_000 },
  { handle: '@yagjjaeng',   displayName: '야그쟁이',       platform: 'YOUTUBE',   folder: '영드짜',       subscribers: 34_000 },
  { handle: '@variety_zip', displayName: 'variety_zip',    platform: 'YOUTUBE',   folder: '예능짜집기',   subscribers: 88_000 },
  { handle: '@kookpong',    displayName: '국뽕TV',         platform: 'YOUTUBE',   folder: '국뽕',         subscribers: 410_000 },
  { handle: '@blackbox_kr', displayName: 'blackbox_kr',    platform: 'YOUTUBE',   folder: '블랙박스',     subscribers: 92_000 },
  { handle: '@ydb_compile', displayName: 'ydb_compile',    platform: 'TIKTOK',    folder: '영드짜',       subscribers: 12_400 },
  { handle: '@meme_kr',     displayName: 'meme_kr',        platform: 'TIKTOK',    folder: '인스타 틱톡 짜집기', subscribers: 21_300 },
  { handle: '@animal_zip',  displayName: 'animal_zip',     platform: 'TIKTOK',    folder: '해짜 (동물)',  subscribers: 21_300 },
  { handle: '@idol_fancam', displayName: 'idol_fancam',    platform: 'TIKTOK',    folder: '아이돌 팬튜브',subscribers: 18_900 },
  { handle: '@movie_kr',    displayName: 'movie_kr',       platform: 'INSTAGRAM', folder: '영드짜',       subscribers: 8_900 },
  { handle: '@cats_daily',  displayName: 'cats_daily',     platform: 'INSTAGRAM', folder: '해짜 (동물)',  subscribers: 14_200 },
  { handle: '@baby_steps',  displayName: 'baby_steps',     platform: 'INSTAGRAM', folder: '아기',         subscribers: 24_000 },
];

const PLATFORMS: { v: Platform | 'ALL'; label: string }[] = [
  { v: 'ALL', label: '전체' },
  { v: 'YOUTUBE', label: 'YouTube' },
  { v: 'TIKTOK', label: 'TikTok' },
  { v: 'INSTAGRAM', label: 'Instagram' },
];

export default function ChannelsPage() {
  const [tab, setTab] = useState<Platform | 'ALL'>('ALL');

  const filtered =
    tab === 'ALL' ? channels : channels.filter((c) => c.platform === tab);

  const handleExport = () => downloadChannelsCsv(filtered, tab);

  return (
    <div className="px-4 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">에셋 채널</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            플랫폼별 탭에서 추가. 폴더(카테고리)는 같이 묶어 관리.
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5 text-[12.5px]">
          <label className="cursor-pointer rounded-lg border bg-card px-3 py-1.5 hover:border-foreground/40">
            CSV 임포트
            <input type="file" accept=".csv" className="hidden" />
          </label>
          <button
            onClick={handleExport}
            className="rounded-lg border bg-card px-3 py-1.5 hover:border-foreground/40"
          >
            CSV 내보내기 ({filtered.length})
          </button>
        </div>
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
                '-mb-px border-b-2 px-3 py-2 text-[13px] transition',
                tab === p.v
                  ? 'border-foreground font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
              <span className="num ml-1.5 text-[11px] text-muted-foreground">
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
          />
        ))
      ) : (
        <PlatformBlock
          platform={tab}
          label={PLATFORMS.find((p) => p.v === tab)!.label}
          list={filtered}
          expandedAlways
        />
      )}
    </div>
  );
}

function PlatformBlock({
  platform,
  label,
  list,
  expandedAlways,
}: {
  platform: Platform;
  label: string;
  list: ChannelMock[];
  expandedAlways?: boolean;
}) {
  const folderMap = list.reduce<Record<string, ChannelMock[]>>((acc, c) => {
    (acc[c.folder] ??= []).push(c);
    return acc;
  }, {});
  const folders = Object.entries(folderMap);

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <PlatformBadge p={platform} />
        <h2 className="text-[14.5px] font-bold">{label}</h2>
        <span className="num text-[11.5px] text-muted-foreground">
          {list.length}개
        </span>
      </div>

      <AddForm platform={platform} />

      {folders.length === 0 ? (
        <div className="rounded-xl border border-dashed py-8 text-center text-[12.5px] text-muted-foreground">
          등록된 {label} 채널 없음.
        </div>
      ) : (
        <div className="space-y-2">
          {folders.map(([folder, items]) => (
            <details
              key={folder}
              open={expandedAlways || items.length <= 4}
              className="group/f overflow-hidden rounded-xl border bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 hover:bg-accent/30">
                <span className="text-muted-foreground/60 transition group-open/f:rotate-90">
                  ▶
                </span>
                <span className="text-[13px] font-semibold">{folder}</span>
                <span className="num text-[11px] text-muted-foreground">
                  ({items.length})
                </span>
              </summary>
              <div className="border-t border-border/60">
                <ul className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((c) => (
                    <li
                      key={c.handle}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold">
                        {c.displayName.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-medium">
                          {c.displayName}
                        </div>
                        <div className="num truncate text-[10.5px] text-muted-foreground">
                          {c.handle}
                        </div>
                      </div>
                      <div className="num text-[11px] text-muted-foreground">
                        {(c.subscribers / 1000).toFixed(0)}K
                      </div>
                      <button
                        title="수집"
                        className="rounded p-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        ↻
                      </button>
                    </li>
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

function AddForm({ platform }: { platform: Platform }) {
  const placeholders: Record<Platform, string> = {
    YOUTUBE: 'https://youtube.com/@건봉이티비  또는  @건봉이티비',
    TIKTOK: 'https://www.tiktok.com/@ydb_compile  또는  @ydb_compile',
    INSTAGRAM: 'https://www.instagram.com/movie_kr  또는  movie_kr',
  };

  return (
    <div className="mb-3 rounded-xl border bg-card p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_100px]">
        <input
          type="text"
          placeholder={placeholders[platform]}
          className="w-full rounded-md border bg-background/40 px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
        />
        <select className="rounded-md border bg-background/40 px-3 py-2 text-[13px] outline-none focus:border-foreground/40">
          <option>폴더: 영드짜</option>
          <option>폴더: 해외 영드짜</option>
          <option>폴더: 예능짜집기</option>
          <option>폴더: 인스타 틱톡 짜집기</option>
          <option>폴더: 잡학상식</option>
          <option>폴더: 국뽕</option>
          <option>폴더: 블랙박스</option>
          <option>폴더: 해짜 (동물)</option>
          <option>폴더: 해짜 | 정보</option>
          <option>폴더: 게임 | 롤</option>
          <option>폴더: 고래</option>
          <option>폴더: 아이돌 팬튜브</option>
          <option>폴더: 감동</option>
          <option>폴더: 대기업</option>
          <option>폴더: 스포츠 | 커뮤</option>
          <option>폴더: 아기</option>
          <option>폴더: 애니 | 짤형</option>
          <option>폴더: 요리</option>
          <option>폴더: 커뮤형</option>
          <option>+ 새 폴더</option>
        </select>
        <button className="rounded-md bg-brand px-3 py-2 text-[13px] font-semibold text-brand-foreground hover:bg-brand/90">
          추가
        </button>
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        URL 또는 핸들(@xxx) 어느 형식이든 OK. 붙여넣으면 자동 파싱.
      </div>
    </div>
  );
}

function downloadChannelsCsv(list: ChannelMock[], scope: Platform | 'ALL') {
  const header = ['platform', 'handle', 'displayName', 'folder', 'subscribers'];
  const rows = list.map((c) => [
    c.platform,
    c.handle,
    c.displayName,
    c.folder,
    String(c.subscribers),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');

  // BOM so Excel opens UTF-8 Korean correctly
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
  } as const;
  const m = map[p];
  return (
    <span
      className={cn(
        'inline-flex h-5 w-7 items-center justify-center rounded border text-[10px] font-black',
        m.color
      )}
    >
      {m.letter}
    </span>
  );
}
