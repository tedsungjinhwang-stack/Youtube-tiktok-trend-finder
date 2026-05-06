import Link from 'next/link';
import { cn, formatKr, formatKrPerHour, formatMultiplier } from '@/lib/utils';

export type VideoCardData = {
  id: string;
  rank?: number;
  platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM';
  thumbnailUrl: string;
  title: string;
  channelName: string;
  channelAvatar?: string;
  folder: string;
  totalViews: number;
  recentGrowthPerHour?: number;
  peakGrowthPerHour?: number;
  channelAvgMultiplier?: number;
  starred?: boolean;
  isViral?: boolean;
};

const placeholderThumb =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 480"><rect fill="%231a1a1f" width="270" height="480"/></svg>';

export function VideoCard({ data }: { data: VideoCardData }) {
  return (
    <Link
      href={`/v/${data.platform.toLowerCase()}/${data.id}`}
      className={cn(
        'group block overflow-hidden rounded-xl border bg-card transition',
        data.isViral
          ? 'border-warning/50 shadow-[0_0_0_1px_hsl(var(--warning)/.25)]'
          : 'border-border/60 hover:border-foreground/30'
      )}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-secondary">
        <img
          src={data.thumbnailUrl || placeholderThumb}
          alt=""
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />

        {data.rank != null && (
          <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-bold backdrop-blur">
            #{data.rank}
          </span>
        )}

        <button
          aria-label="관심"
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[12px] backdrop-blur hover:bg-black/80"
        >
          <span className={data.starred ? 'text-warning' : 'text-white/70'}>
            ★
          </span>
        </button>

        <span className="absolute bottom-2 left-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[10px] font-black backdrop-blur">
          <PlatformLetter p={data.platform} />
        </span>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-2 bottom-2 line-clamp-2 text-[12.5px] font-semibold leading-snug text-white">
          {data.title}
        </div>
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-secondary text-[8px] font-bold">
            {data.channelName.slice(0, 1)}
          </span>
          <span className="truncate">{data.channelName}</span>
          <span className="shrink-0 rounded border border-border/60 px-1 py-px text-[9px] text-muted-foreground/80">
            {data.folder}
          </span>
        </div>

        <Stat
          label="누적"
          value={formatKr(data.totalViews)}
          accent="primary"
        />
        {data.recentGrowthPerHour != null && (
          <Stat
            label="증가/h"
            value={formatKrPerHour(data.recentGrowthPerHour)}
            accent={data.recentGrowthPerHour > 0 ? 'up' : 'muted'}
            arrow={data.recentGrowthPerHour > 0 ? '▲' : undefined}
          />
        )}
        {data.peakGrowthPerHour != null && (
          <Stat
            label="피크"
            value={formatKrPerHour(data.peakGrowthPerHour)}
            accent="muted"
          />
        )}
        {data.channelAvgMultiplier != null && (
          <Stat
            label="채널평균"
            value={formatMultiplier(data.channelAvgMultiplier)}
            accent={
              data.channelAvgMultiplier >= 7
                ? 'warning'
                : data.channelAvgMultiplier >= 3
                  ? 'up'
                  : 'muted'
            }
          />
        )}
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  accent,
  arrow,
}: {
  label: string;
  value: string;
  accent: 'primary' | 'up' | 'muted' | 'warning';
  arrow?: string;
}) {
  const valueColor =
    accent === 'up'
      ? 'text-success'
      : accent === 'warning'
        ? 'text-warning'
        : accent === 'muted'
          ? 'text-foreground/85'
          : 'text-foreground';
  return (
    <div className="flex items-baseline justify-between text-[11.5px]">
      <span className="text-muted-foreground/80">{label}</span>
      <span className={cn('num font-semibold tabular-nums', valueColor)}>
        {arrow ? `${arrow} ` : ''}
        {value}
      </span>
    </div>
  );
}

function PlatformLetter({ p }: { p: VideoCardData['platform'] }) {
  if (p === 'YOUTUBE') return <span className="text-red-500">Y</span>;
  if (p === 'TIKTOK') return <span className="text-white">T</span>;
  return <span className="text-pink-400">I</span>;
}
