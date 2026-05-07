import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatKr, formatKrPerHour, formatMultiplier } from '@/lib/utils';
import { viewsPerHour, getGrowthBadge, isVerifiedHit } from '@/lib/grading';
import { VideoActions } from './video-actions';

export const dynamic = 'force-dynamic';

type Params = { platform: string; id: string };

export default async function VideoDetailPage({
  params,
}: {
  params: Params;
}) {
  const v = await prisma.video.findUnique({
    where: { id: params.id },
    include: {
      channel: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          subscriberCount: true,
          folder: { select: { name: true } },
        },
      },
    },
  });

  if (!v) notFound();

  // 같은 채널의 최근 다른 영상 (이 영상 제외, 최대 3개)
  const recent = await prisma.video.findMany({
    where: {
      channelId: v.channelId,
      id: { not: v.id },
    },
    orderBy: { publishedAt: 'desc' },
    take: 3,
    select: { id: true, caption: true, viewCount: true, publishedAt: true },
  });

  const totalViews = Number(v.viewCount);
  const avgPerHour = Math.round(viewsPerHour(totalViews, v.publishedAt));
  const growth = getGrowthBadge(totalViews, v.publishedAt);
  const verified = isVerifiedHit(totalViews);

  const recentAvg =
    recent.length > 0
      ? recent.reduce((s, r) => s + Number(r.viewCount), 0) / recent.length
      : null;

  const channelDisplay =
    v.channel.displayName ?? v.channel.handle ?? '(이름 모름)';

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground"
      >
        ← 목록으로
      </Link>

      <VideoActions videoId={v.id} url={v.url} />

      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
          <div className="relative aspect-[9/16] sm:aspect-auto">
            {v.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={v.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-secondary" />
            )}
            <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-[12px] font-black backdrop-blur">
              {v.platform[0]}
            </span>
            {verified && (
              <span
                className="absolute -top-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full bg-amber-400 text-[14px] shadow-md shadow-amber-400/40"
                title="검증된 히트 (50만↑)"
              >
                🌟
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 p-4">
            <h1 className="text-[18px] font-bold leading-snug">
              {v.caption ?? '(제목 없음)'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-muted-foreground">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-[12px] font-bold">
                {channelDisplay.slice(0, 1)}
              </span>
              <span>{channelDisplay}</span>
              {v.channel.subscriberCount != null && (
                <span className="num text-[12px]">
                  · {formatKr(v.channel.subscriberCount)} 구독
                </span>
              )}
              <span className="text-muted-foreground/60">·</span>
              <span className="rounded border border-border/60 px-1.5 py-0.5 text-[12px]">
                {v.channel.folder.name.startsWith('__')
                  ? '해시태그 발견'
                  : v.channel.folder.name}
              </span>
              {v.sourceHashtag && (
                <span className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[12px] text-amber-400">
                  #{v.sourceHashtag}
                </span>
              )}
              {growth && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${growth.color}`}
                >
                  {growth.emoji} {growth.label}
                </span>
              )}
            </div>
            <div className="text-[13px] text-muted-foreground">
              업로드: {formatKstDateTime(v.publishedAt)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatBox label="누적 조회수" value={formatKr(totalViews)} primary />
        <StatBox
          label="평균 증가/h"
          value={formatKrPerHour(avgPerHour)}
          sub="게시 이후"
        />
        {v.likeCount != null && (
          <StatBox label="좋아요" value={formatKr(v.likeCount)} />
        )}
        {v.commentCount != null && (
          <StatBox label="댓글" value={formatKr(v.commentCount)} />
        )}
        {v.viralScore != null && (
          <StatBox
            label="채널 평균 대비"
            value={formatMultiplier(v.viralScore)}
            sub={recentAvg ? `채널 최근 평균 ${formatKr(recentAvg)}` : undefined}
          />
        )}
        {v.durationSeconds != null && (
          <StatBox
            label="길이"
            value={formatDuration(v.durationSeconds)}
            sub={v.isShorts ? 'Shorts' : '롱폼'}
          />
        )}
      </div>

      {recent.length > 0 && (
        <div className="mt-6 rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14.5px] font-semibold">
              {channelDisplay} 의 최근 영상
            </h3>
            {recentAvg != null && (
              <span className="text-[12px] text-muted-foreground">
                평균 {formatKr(recentAvg)} · 채널평균 비교용
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-[13px]">
            {recent.map((r) => (
              <Link
                href={`/v/${v.platform.toLowerCase()}/${r.id}`}
                key={r.id}
                className="rounded-md border border-border/60 bg-background/40 px-3 py-2 hover:border-foreground/40"
              >
                <div className="truncate font-medium">
                  {r.caption ?? '(제목 없음)'}
                </div>
                <div className="num mt-0.5 text-muted-foreground">
                  {formatKr(Number(r.viewCount))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
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
      <div className="text-[12.5px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </div>
      <div
        className={`num mt-1 text-[22px] font-bold tabular-nums ${primary ? 'text-foreground' : 'text-foreground/95'}`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[12.5px] text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

function formatKstDateTime(d: Date): string {
  // KST 표시
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const Y = kst.getUTCFullYear();
  const M = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const D = String(kst.getUTCDate()).padStart(2, '0');
  const h = kst.getUTCHours();
  const m = String(kst.getUTCMinutes()).padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${Y}. ${M}. ${D}. ${ampm} ${String(h12).padStart(2, '0')}:${m} (KST)`;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}
