import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scrapeChannel } from '@/lib/scraper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 채널 백필 — 옛날 영상 1000개 깊이 스크랩.
 * 수동 트리거 전용 (자동 cron X). backfilledAt 이 null 인 활성 채널만 처리.
 *
 * POST /api/v1/backfill-channels
 *   사이트 쿠키 인증
 * → { processed: N, remaining: M, results: [...] }
 *
 * 60초 timeout 안에 5개 처리. remaining > 0 이면 다시 호출 (UI 가 루프).
 */
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED' } },
      { status: 401 }
    );
  }

  const channels = await prisma.channel.findMany({
    where: { isActive: true, backfilledAt: null },
    take: 5,
    orderBy: { addedAt: 'asc' },
  });
  const totalRemainingBefore = await prisma.channel.count({
    where: { isActive: true, backfilledAt: null },
  });

  if (channels.length === 0) {
    return NextResponse.json({
      success: true,
      data: { processed: 0, remaining: 0 },
    });
  }

  const results: Array<{ name: string; ok: boolean; videos?: number; error?: string }> = [];
  for (const c of channels) {
    try {
      const r = await scrapeChannel(c, { maxVideos: 1000 });
      await prisma.channel.update({
        where: { id: c.id },
        data: { backfilledAt: new Date() },
      });
      results.push({
        name: c.displayName ?? c.externalId,
        ok: true,
        videos: r.videos.length,
      });
    } catch (e) {
      results.push({
        name: c.displayName ?? c.externalId,
        ok: false,
        error: (e as Error).message.slice(0, 160),
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      processed: results.length,
      remaining: totalRemainingBefore - results.filter((r) => r.ok).length,
      results,
    },
  });
}
