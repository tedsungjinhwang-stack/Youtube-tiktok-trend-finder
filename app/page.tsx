import { CategoryTabs } from '@/components/category-tabs';
import { VideoCard } from '@/components/video-card';
import { mockHotVideos, mockViralVideos } from '@/lib/mock-data';

export default function HomePage() {
  const top = mockHotVideos.slice(0, 14);
  const viral = mockViralVideos.slice(0, 7);

  return (
    <>
      <CategoryTabs active="all" />

      <div className="space-y-8 px-4 py-4">
        <Section
          title="HOT · 터진 영상"
          subtitle="최근 7일 폴더별 인기"
          href="/hot-videos"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {top.map((v) => (
              <VideoCard key={v.id} data={v} />
            ))}
          </div>
        </Section>

        {viral.length > 0 && (
          <Section
            title="VIRAL · 심정지"
            subtitle="채널 평균 대비 7배 이상 터진 영상"
            href="/viral-alerts"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {viral.map((v) => (
                <VideoCard key={v.id} data={v} />
              ))}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}

function Section({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <a
          href={href}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          전체 보기 →
        </a>
      </div>
      {children}
    </section>
  );
}
