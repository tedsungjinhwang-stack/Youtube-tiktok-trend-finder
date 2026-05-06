import Link from 'next/link';
import { mockHotVideos } from '@/lib/mock-data';
import { formatKr, formatKrPerHour, formatMultiplier } from '@/lib/utils';

type Params = { platform: string; id: string };

export default function VideoDetailPage({ params }: { params: Params }) {
  const v =
    mockHotVideos.find((x) => x.id === params.id) ?? mockHotVideos[0];

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <Link
        href="/hot-videos"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        ← 목록으로
      </Link>

      <ActionRow />

      <Banner />

      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
          <div className="relative aspect-[9/16] sm:aspect-auto">
            <img
              src={v.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[10px] font-black backdrop-blur">
              {v.platform[0]}
            </span>
          </div>

          <div className="flex flex-col gap-3 p-4">
            <h1 className="text-[17px] font-bold leading-snug">{v.title}</h1>
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-[10px] font-bold">
                {v.channelName.slice(0, 1)}
              </span>
              <span>{v.channelName}</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px]">
                {v.folder}
              </span>
            </div>
            <div className="text-[12px] text-muted-foreground">
              업로드: 2026. 05. 05. PM 05:00
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="rounded-md border bg-background/40 px-2 py-1.5 text-[12.5px]">
                <option>05. 06. PM 07:00</option>
                <option>05. 06. PM 04:00</option>
                <option>05. 06. PM 01:00</option>
              </select>
              <button className="rounded-md bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90">
                적용
              </button>
            </div>
          </div>
        </div>
      </div>

      <StatGrid v={v} />

      <ChannelRecentRecords />
    </div>
  );
}

function ActionRow() {
  const actions = [
    { icon: '⎘', label: 'URL 복사' },
    { icon: '↗', label: '원본 영상' },
    { icon: '▦', label: '프레임 보기' },
    { icon: '★', label: '영상 즐겨찾기' },
    { icon: '☆', label: '채널 즐겨찾기' },
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {actions.map((a) => (
        <button
          key={a.label}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          <span className="text-[13px]">{a.icon}</span>
          {a.label}
        </button>
      ))}
    </div>
  );
}

function Banner() {
  return (
    <div className="rounded-lg border bg-card/60 px-4 py-3 text-[12.5px]">
      <div className="font-semibold">기록 횟수 4회 · 최근 24시간 4회</div>
      <p className="mt-1 text-muted-foreground">
        피드에 잡힌 영상만 일정 주기로 추적해 기록을 누적합니다. 유튜브 전체를
        매시간 수집하는 게 아닙니다.
      </p>
    </div>
  );
}

function StatGrid({
  v,
}: {
  v: (typeof mockHotVideos)[number];
}) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatBox label="누적 조회수" value={formatKr(v.totalViews)} primary />
      <StatBox
        label="최근 증가/h"
        value={formatKrPerHour(v.recentGrowthPerHour ?? 0)}
        sub="직전 측정 기준"
      />
      <StatBox
        label="최대 증가/h"
        value={formatKrPerHour(v.peakGrowthPerHour ?? v.recentGrowthPerHour ?? 0)}
        sub="05. 06. PM 07:00"
      />
      <StatBox
        label="평균 증가/h"
        value={formatKrPerHour(
          Math.round((v.recentGrowthPerHour ?? 0) * 0.45)
        )}
        sub="게시 이후"
      />
      <StatBox
        label="채널 평균 대비"
        value={formatMultiplier(v.channelAvgMultiplier ?? 0)}
        sub="기준 70만 (다른 영상 3개)"
      />
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
  primary,
}: {
  label: string;
  value: string;
  sub?: string;
  primary?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </div>
      <div
        className={`num mt-1 text-[20px] font-bold tabular-nums ${primary ? 'text-foreground' : 'text-foreground/95'}`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

function ChannelRecentRecords() {
  return (
    <div className="mt-6 rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13.5px] font-semibold">채널 최근 영상 (3개)</h3>
        <span className="text-[11px] text-muted-foreground">
          평균 70만 · 채널평균 대비 비교용
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11.5px]">
        {[
          { title: '이전 영상 A', views: 820_000 },
          { title: '이전 영상 B', views: 640_000 },
          { title: '이전 영상 C', views: 590_000 },
        ].map((row) => (
          <div
            key={row.title}
            className="rounded-md border border-border/60 bg-background/40 px-3 py-2"
          >
            <div className="truncate font-medium">{row.title}</div>
            <div className="num mt-0.5 text-muted-foreground">
              {formatKr(row.views)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
