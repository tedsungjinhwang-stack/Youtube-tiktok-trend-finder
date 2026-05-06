import { CategoryTabs } from '@/components/category-tabs';
import { VideoCard } from '@/components/video-card';
import { mockViralVideos } from '@/lib/mock-data';

export default function ViralAlertsPage() {
  return (
    <>
      <CategoryTabs active="all" />

      <div className="px-4 py-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold tracking-tight">VIRAL · 심정지 영상</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            viralScore ≥ 7 · 조회 ≥ 30만 · 채널 평균 대비 7배 이상 터진 영상
          </p>
        </div>

        {mockViralVideos.length === 0 ? (
          <div className="rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">
            현재 임계치를 넘긴 영상 없음.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {mockViralVideos.map((v) => (
              <VideoCard key={v.id} data={v} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
