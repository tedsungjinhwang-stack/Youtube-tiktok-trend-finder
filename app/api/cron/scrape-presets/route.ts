import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/auth';
import { getCredSync } from '@/lib/credentials';
import { prisma } from '@/lib/db';
import { runPreset } from '@/lib/presets/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 활성화된 모든 ScrapePreset 을 순차 실행.
 * 외부 cron(cron-job.org)에서 매시간/매일 호출.
 *
 * GET /api/cron/scrape-presets
 *   Authorization: Bearer <CRON_SECRET> 또는 ?secret=<CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const qSecret = req.nextUrl.searchParams.get('secret');
  const expected = getCredSync('CRON_SECRET');
  const ok = checkCronAuth(req) || (!!expected && qSecret === expected);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED' } },
      { status: 401 }
    );
  }
  const presets = await prisma.scrapePreset.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const results: Array<{
    name: string;
    matched?: number;
    scraped?: { dispatched: number; ok: number; failed: number };
    error?: string;
  }> = [];
  for (const p of presets) {
    try {
      const r = await runPreset(p);
      results.push({ name: p.name, matched: r.matched, scraped: r.scraped });
    } catch (e) {
      results.push({ name: p.name, error: (e as Error).message.slice(0, 200) });
    }
  }

  // 관심영상(별표) 안 한 영상 중 30일 지난 거 자동 정리.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let cleanedVideos = 0;
  try {
    const r = await prisma.video.deleteMany({
      where: { isStarred: false, fetchedAt: { lt: cutoff } },
    });
    cleanedVideos = r.count;
  } catch (e) {
    console.error('[preset cron cleanup]', (e as Error).message);
  }

  return NextResponse.json({
    success: true,
    data: { total: presets.length, results, cleanedVideos },
  });
}
