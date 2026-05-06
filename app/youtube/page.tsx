import { CategoryTabs } from '@/components/category-tabs';
import { VideoCard } from '@/components/video-card';
import { mockHotVideos } from '@/lib/mock-data';

export default function YoutubePage() {
  const videos = mockHotVideos
    .filter((v) => v.platform === 'YOUTUBE')
    .map((v, i) => ({ ...v, rank: i + 1 }));

  return (
    <>
      <CategoryTabs active="all" />

      <div className="px-4 py-4">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">YouTube</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              에셋 채널 YT 영상 · 폴더·기간·임계치 필터링
            </p>
          </div>
          <div className="hidden gap-1.5 text-[12px] md:flex">
            <Toggle label="숏폼" />
            <Toggle label="롱폼" />
            <Toggle label="ALL" active />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[12px]">
          <SortPill label="24h" />
          <SortPill label="7일" active />
          <SortPill label="30일" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {videos.map((v) => (
            <VideoCard key={v.id} data={v} />
          ))}
        </div>
      </div>
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
