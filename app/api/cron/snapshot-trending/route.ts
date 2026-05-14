import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fetchTrending } from '@/lib/youtube/trending';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron: 매시간 트리거 → DB 의 TrendingSettings 보고 due 한 경우에만 실행.
 *
 * 동작:
 *  1. settings.enabled false → skip
 *  2. now - lastRunAt < intervalHours → skip
 *  3. KR mostPopular 200개 fetch → TrendingSnapshot 누적 삽입
 *  4. settings.lastRunAt 갱신
 *
 * 누적 데이터는 /api/v1/youtube/trending 에서 최근 72시간 분 쿼리해서 노출.
 */
export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'CRON_SECRET required' } },
      { status: 401 }
    );
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  const settings = await ensureSettings();

  if (!settings.enabled && !force) {
    return NextResponse.json({
      success: true,
      data: { skipped: true, reason: 'disabled' },
    });
  }

  if (!force && settings.lastRunAt) {
    const sinceMs = Date.now() - settings.lastRunAt.getTime();
    const intervalMs = settings.intervalHours * 3600_000;
    if (sinceMs < intervalMs) {
      const remainMin = Math.round((intervalMs - sinceMs) / 60_000);
      return NextResponse.json({
        success: true,
        data: {
          skipped: true,
          reason: `interval not due (${remainMin}분 남음)`,
        },
      });
    }
  }

  try {
    const videos = await fetchTrending('KR', 4);
    if (videos.length === 0) {
      await prisma.trendingSettings.update({
        where: { id: 'default' },
        data: { lastRunAt: new Date(), lastError: 'empty result' },
      });
      return NextResponse.json({
        success: true,
        data: { saved: 0, reason: 'empty fetch' },
      });
    }

    const capturedAt = new Date();
    await prisma.trendingSnapshot.createMany({
      data: videos.map((v) => ({
        region: 'KR',
        videoId: v.videoId,
        title: v.title,
        channelId: v.channelId,
        channelName: v.channelName,
        thumbnailUrl: v.thumbnailUrl || null,
        viewCount: BigInt(v.viewCount),
        likeCount: v.likeCount != null ? BigInt(v.likeCount) : null,
        commentCount: v.commentCount != null ? BigInt(v.commentCount) : null,
        durationSeconds: v.durationSeconds,
        isShorts: v.isShorts,
        publishedAt: new Date(v.publishedAt),
        capturedAt,
      })),
    });

    // 30일 넘은 오래된 스냅샷 정리 (DB 무한 증가 방지)
    const monthAgo = new Date(Date.now() - 30 * 86_400_000);
    await prisma.trendingSnapshot.deleteMany({
      where: { capturedAt: { lt: monthAgo } },
    });

    await prisma.trendingSettings.update({
      where: { id: 'default' },
      data: { lastRunAt: capturedAt, lastError: null },
    });

    return NextResponse.json({
      success: true,
      data: { saved: videos.length, capturedAt },
    });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await prisma.trendingSettings
      .update({
        where: { id: 'default' },
        data: { lastRunAt: new Date(), lastError: msg },
      })
      .catch(() => null);
    return NextResponse.json(
      { success: false, error: { code: 'SNAPSHOT_FAILED', message: msg } },
      { status: 500 }
    );
  }
}

async function ensureSettings() {
  let s = await prisma.trendingSettings.findUnique({ where: { id: 'default' } });
  if (!s) {
    s = await prisma.trendingSettings.create({
      data: { id: 'default', enabled: true, intervalHours: 4 },
    });
  }
  return s;
}
