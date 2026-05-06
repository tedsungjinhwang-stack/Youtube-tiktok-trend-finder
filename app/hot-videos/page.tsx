import { CategoryTabs } from '@/components/category-tabs';
import { VideoCard } from '@/components/video-card';
import { mockHotVideos } from '@/lib/mock-data';

export default function HotVideosPage() {
  return (
    <>
      <CategoryTabs active="all" />

      <div className="px-4 py-4">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">HOT · 터진 영상</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              viralScore ≥ 3 · 조회 ≥ 5만 · 최근 7일
            </p>
          </div>
          <div className="hidden gap-1 text-[11px] text-muted-foreground md:flex">
            <Pill>최근 24h 갱신</Pill>
            <Pill>실시간 추적 14개</Pill>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {mockHotVideos.map((v) => (
            <VideoCard key={v.id} data={v} />
          ))}
        </div>
      </div>
    </>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5">
      {children}
    </span>
  );
}
