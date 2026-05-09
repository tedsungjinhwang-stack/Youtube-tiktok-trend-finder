'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn, formatKr, formatKrPerHour, formatMultiplier } from '@/lib/utils';
import { getGrowthBadge, getRankBadge, isVerifiedHit } from '@/lib/grading';
import { deleteVideoAction, toggleStarVideoAction } from '@/app/actions/videos';

export type VideoCardData = {
  id: string;
  /** 플랫폼 고유 ID — YouTube는 11자 비디오 ID, TT/IG는 short code */
  externalId?: string;
  /** 원본 URL (Instagram embed 미리보기에 필요) */
  url?: string;
  rank?: number;
  platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM';
  thumbnailUrl: string;
  title: string;
  channelName: string;
  channelAvatar?: string;
  folder: string;
  totalViews: number;
  publishedAt?: Date | string;
  recentGrowthPerHour?: number;
  peakGrowthPerHour?: number;
  channelAvgMultiplier?: number;
  starred?: boolean;
  /** true면 HOT/주목 배지 숨김 (#rank 자체는 유지) */
  hideRankBadge?: boolean;
};

const HOVER_DELAY_MS = 400;

const placeholderThumb =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 480"><rect fill="%231a1a1f" width="270" height="480"/></svg>';

export function VideoCard({ data }: { data: VideoCardData }) {
  const growth = data.publishedAt
    ? getGrowthBadge(data.totalViews, data.publishedAt)
    : null;
  const rankBadge =
    data.rank != null && !data.hideRankBadge ? getRankBadge(data.rank) : null;
  const verifiedHit = isVerifiedHit(data.totalViews);

  const router = useRouter();
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [starred, setStarred] = useState(data.starred ?? false);
  const [, startStarTransition] = useTransition();

  const onToggleStar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const prev = starred;
    setStarred(!prev); // optimistic
    startStarTransition(async () => {
      const r = await toggleStarVideoAction(data.id);
      if (!r.ok) setStarred(prev);
      else {
        setStarred(r.starred);
        router.refresh(); // 정렬에 반영
      }
    });
  };

  const onDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDeleting) return;
    if (!confirm(`"${data.title.slice(0, 30)}…" 영상을 삭제할까요?`)) return;
    setDeleteError(null);
    startDelete(async () => {
      const r = await deleteVideoAction(data.id);
      if (!r.ok) setDeleteError(r.error);
      else router.refresh();
    });
  };

  const [previewing, setPreviewing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewUrl = buildPreviewUrl(data.platform, data.externalId, data.url);

  const onEnter = () => {
    if (!previewUrl) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setPreviewing(true), HOVER_DELAY_MS);
  };

  const onLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPreviewing(false);
  };

  return (
    <Link
      href={`/v/${data.platform.toLowerCase()}/${data.id}`}
      className={cn(
        'group block overflow-hidden rounded-xl border bg-card transition hover:border-foreground/30',
        verifiedHit
          ? 'border-amber-400/70 shadow-lg shadow-amber-400/20'
          : 'border-border/60'
      )}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-secondary">
        <img
          src={data.thumbnailUrl || placeholderThumb}
          alt=""
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />

        {previewing && previewUrl && (
          <iframe
            src={previewUrl}
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; encrypted-media"
            // eslint-disable-next-line react/no-unknown-property
            allowFullScreen
          />
        )}

        {data.rank != null && (
          <span
            className={cn(
              'absolute left-2 top-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-bold backdrop-blur',
              rankBadge?.pillClass ?? 'bg-black/70'
            )}
            title={
              rankBadge
                ? `${rankBadge.label} (현재 정렬 #${data.rank})`
                : `정렬 #${data.rank}`
            }
          >
            <span>#{data.rank}</span>
            {rankBadge && (
              <span className="ml-0.5 inline-flex items-center gap-0.5">
                <span>{rankBadge.emoji}</span>
                <span className="text-[11px]">{rankBadge.label}</span>
              </span>
            )}
          </span>
        )}

        {verifiedHit && (
          <span
            className="absolute -top-1.5 -right-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-[13px] shadow-md shadow-amber-400/40"
            title="검증된 히트 (50만↑)"
          >
            🌟
          </span>
        )}

        {growth && (
          <span
            className={cn(
              'absolute left-2 top-9 rounded px-1.5 py-0.5 text-[11px] font-bold backdrop-blur',
              growth.color
            )}
            title={`시간당 ${formatKr(growth.perHour)}회`}
          >
            {growth.emoji} {growth.label}
          </span>
        )}

        <button
          aria-label={starred ? '별표 해제' : '별표'}
          title={starred ? '별표 해제 (정렬 맨 앞에서 빠짐)' : '별표 (목록 맨 앞으로)'}
          onClick={onToggleStar}
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[13px] backdrop-blur hover:bg-black/80"
        >
          <span className={starred ? 'text-warning' : 'text-white/70'}>★</span>
        </button>

        <button
          aria-label="삭제"
          title="영상 삭제"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute right-2 top-10 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[12px] text-white/70 opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-red-600/90 hover:text-white disabled:opacity-30"
        >
          {isDeleting ? '…' : '✕'}
        </button>

        {deleteError && (
          <span className="absolute right-2 top-[4.5rem] rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] text-white">
            {deleteError.slice(0, 30)}
          </span>
        )}

        <span className="absolute bottom-2 left-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[11px] font-black backdrop-blur">
          <PlatformLetter p={data.platform} />
        </span>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-2 bottom-2 line-clamp-2 text-[13.5px] font-semibold leading-snug text-white">
          {data.title}
        </div>
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-secondary text-[9px] font-bold">
            {data.channelName.slice(0, 1)}
          </span>
          <span className="truncate">{data.channelName}</span>
          <span className="shrink-0 rounded border border-border/60 px-1 py-px text-[10px] text-muted-foreground/80">
            {data.folder}
          </span>
        </div>

        <Stat
          label="조회"
          value={formatKr(data.totalViews)}
          accent="primary"
        />
        {data.publishedAt && (
          <Stat
            label="업로드"
            value={formatRelative(data.publishedAt)}
            accent="muted"
          />
        )}
        {data.recentGrowthPerHour != null && (
          <Stat
            label="속도"
            value={formatKrPerHour(data.recentGrowthPerHour)}
            accent={data.recentGrowthPerHour > 0 ? 'up' : 'muted'}
            arrow={data.recentGrowthPerHour > 0 ? '▲' : undefined}
          />
        )}
        {data.channelAvgMultiplier != null && (
          <Stat
            label="상승"
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
    <div className="flex items-baseline justify-between text-[12.5px]">
      <span className="text-muted-foreground/80">{label}</span>
      <span className={cn('num font-semibold tabular-nums', valueColor)}>
        {arrow ? `${arrow} ` : ''}
        {value}
      </span>
    </div>
  );
}

function formatRelative(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(ms / 3_600_000);
  const day = Math.floor(ms / 86_400_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  if (day < 30) return `${day}일 전`;
  // 30일 넘으면 날짜 표시 (KST, 년도 포함)
  const kst = new Date(date.getTime() + 9 * 3600_000);
  const Y = String(kst.getUTCFullYear()).slice(2); // 2자리 연도
  const M = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const D = String(kst.getUTCDate()).padStart(2, '0');
  return `${Y}.${M}.${D}`;
}

function buildPreviewUrl(
  platform: VideoCardData['platform'],
  externalId: string | undefined,
  url: string | undefined
): string | null {
  if (platform === 'YOUTUBE') {
    if (!externalId) return null;
    // mute=1은 autoplay 정책상 필수
    return `https://www.youtube.com/embed/${externalId}?autoplay=1&mute=1&controls=0&modestbranding=1&playsinline=1&rel=0`;
  }
  if (platform === 'TIKTOK') {
    if (!externalId) return null;
    return `https://www.tiktok.com/embed/v2/${externalId}`;
  }
  if (platform === 'INSTAGRAM') {
    // url에서 shortcode 추출 — /p/{code}/ 또는 /reel/{code}/
    if (!url) return null;
    const m = url.match(/\/(?:p|reel|tv)\/([^/?]+)/);
    if (!m) return null;
    return `https://www.instagram.com/p/${m[1]}/embed/`;
  }
  return null;
}

function PlatformLetter({ p }: { p: VideoCardData['platform'] }) {
  if (p === 'YOUTUBE') return <span className="text-red-500">Y</span>;
  if (p === 'TIKTOK') return <span className="text-white">T</span>;
  return <span className="text-pink-400">I</span>;
}
