import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth, checkApiKey } from '@/lib/auth';
import { getCredSync } from '@/lib/credentials';
import { prisma } from '@/lib/db';
import { scrapeChannel } from '@/lib/scraper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 채널 백필 cron — backfilledAt 이 null 인 채널들을 1000개씩 깊이 스크랩.
 * 채널 추가 시 자동 호출 + 외부 cron(cron-job.org) 에 매일 등록해도 안전.
 *
 * GET /api/cron/backfill-channels
 *   Authorization: Bearer <CRON_SECRET> 또는 ?secret=<CRON_SECRET>
 *   또는 사이트 쿠키 (POST 가 아니라 GET 이지만 동일 인증 허용)
 */
export async function GET(req: NextRequest) {
  const qSecret = req.nextUrl.searchParams.get('secret');
  const expected = getCredSync('CRON_SECRET');
  const ok =
    checkCronAuth(req) ||
    (!!expected && qSecret === expected) ||
    checkApiKey(req);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED' } },
      { status: 401 }
    );
  }

  // 활성 + 미백필 채널 (한 번에 너무 많이 돌면 60초 timeout — 최대 5개로 제한)
  const channels = await prisma.channel.findMany({
    where: { isActive: true, backfilledAt: null },
    take: 5,
    orderBy: { addedAt: 'asc' },
  });

  if (channels.length === 0) {
    return NextResponse.json({
      success: true,
      data: { backfilled: 0, message: '백필 대상 채널 없음' },
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
    data: { backfilled: results.length, results },
  });
}
