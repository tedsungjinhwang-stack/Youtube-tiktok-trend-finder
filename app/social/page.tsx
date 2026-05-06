'use client';

import { useEffect, useState } from 'react';
import { CategoryTabs } from '@/components/category-tabs';
import { VideoCard } from '@/components/video-card';
import { HashtagManager } from '@/components/hashtag-manager';
import { mockHotVideos, mockHashtagFeed } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

type Mode = 'asset' | 'feed';

type StoredHashtag = {
  id: string;
  platform: 'TIKTOK' | 'INSTAGRAM';
  tag: string;
};

export default function SocialPage() {
  const [mode, setMode] = useState<Mode>('asset');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [registeredTags, setRegisteredTags] = useState<StoredHashtag[]>([]);

  useEffect(() => {
    if (mode !== 'feed') return;
    fetch('/api/v1/hashtags')
      .then((r) => r.json())
      .then((j) => setRegisteredTags(j.data ?? []));
  }, [mode]);

  const assetVideos = mockHotVideos
    .filter((v) => v.platform === 'TIKTOK' || v.platform === 'INSTAGRAM')
    .map((v, i) => ({ ...v, rank: i + 1 }));

  // 선택된 태그가 있으면 그 태그 매칭하는 영상만, 없으면 등록된 모든 태그
  const activeTagSet =
    selectedIds.length > 0
      ? new Set(
          registeredTags
            .filter((h) => selectedIds.includes(h.id))
            .map((h) => h.tag.toLowerCase())
        )
      : new Set(registeredTags.map((h) => h.tag.toLowerCase()));

  const feedVideos = mockHashtagFeed.filter((v) => {
    const t = v.hashtag.replace(/^#/, '').toLowerCase();
    return activeTagSet.has(t);
  });

  return (
    <>
      <CategoryTabs active="all" />

      <div className="px-4 py-4">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">TikTok / Instagram</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              에셋 채널의 영상 또는 해시태그 인기피드 — 토글로 전환
            </p>
          </div>
          <div className="hidden gap-1.5 text-[12px] md:flex">
            <Toggle label="TikTok" active />
            <Toggle label="Instagram" active />
          </div>
        </div>

        <ModeSwitch
          mode={mode}
          onChange={setMode}
          assetCount={assetVideos.length}
          feedCount={feedVideos.length}
        />

        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[12px]">
          <SortPill label="24h" active />
          <SortPill label="7일" />
          <SortPill label="30일" />
        </div>

        {mode === 'asset' ? (
          <AssetView videos={assetVideos} />
        ) : (
          <FeedView
            videos={feedVideos}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />
        )}
      </div>
    </>
  );
}

function ModeSwitch({
  mode,
  onChange,
  assetCount,
  feedCount,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  assetCount: number;
  feedCount: number;
}) {
  return (
    <div className="mb-4 inline-flex rounded-lg border bg-card p-1 text-[12.5px]">
      <SwitchBtn
        active={mode === 'asset'}
        onClick={() => onChange('asset')}
        label="에셋 채널"
        sub={`${assetCount}개`}
        title="등록한 채널의 최신 영상"
      />
      <SwitchBtn
        active={mode === 'feed'}
        onClick={() => onChange('feed')}
        label="인기피드"
        sub={`${feedCount}개`}
        title="해시태그 기반 발견 (모르는 계정 포함)"
      />
    </div>
  );
}

function SwitchBtn({
  active,
  onClick,
  label,
  sub,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-md px-3 py-1.5 transition',
        active
          ? 'bg-foreground font-semibold text-background'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
      <span className="num ml-1.5 text-[10.5px] opacity-70">{sub}</span>
    </button>
  );
}

function AssetView({ videos }: { videos: typeof mockHotVideos }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {videos.map((v) => (
        <VideoCard key={v.id} data={v} />
      ))}
    </div>
  );
}

function FeedView({
  videos,
  selectedIds,
  onSelectionChange,
}: {
  videos: typeof mockHashtagFeed;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  return (
    <>
      <HashtagManager
        selectedIds={selectedIds}
        onSelectionChange={onSelectionChange}
      />

      {videos.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-[12.5px] text-muted-foreground">
          {selectedIds.length > 0
            ? '선택된 해시태그에 매칭되는 영상이 없습니다.'
            : '등록된 해시태그가 없거나 매칭 영상 없음. 위에서 해시태그를 추가하세요.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {videos.map((v) => (
            <div key={v.id} className="relative">
              <VideoCard data={{ ...v, channelAvgMultiplier: undefined }} />
              <span className="absolute right-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                {v.hashtag}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Toggle({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      className={
        'rounded-md border px-2.5 py-1 ' +
        (active
          ? 'border-foreground/40 bg-foreground text-background'
          : 'border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground')
      }
    >
      {label}
    </button>
  );
}

function SortPill({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      className={
        'rounded-full px-3 py-1 ' +
        (active
          ? 'bg-foreground text-background'
          : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground')
      }
    >
      {label}
    </button>
  );
}
