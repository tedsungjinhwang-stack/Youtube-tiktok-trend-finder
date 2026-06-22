import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 캘린더 동기화 cron — 외부 cron(cron-job.org) 매시간 호출용.
 * 활성 채널의 DB 예약 데이터를 Google Calendar 이벤트로 반영.
 *
 * 인증 (셋 중 하나):
 *   - `Authorization: Bearer <CRON_SECRET>` 헤더
 *   - `?secret=<CRON_SECRET>` 쿼리 (헤더 못 넣는 cron 서비스용)
 *   - `x-vercel-cron` 헤더 (구버전 Vercel cron 호환)
 *   - CRON_SECRET 미설정 시 무인증 (개발/로컬)
 */
export async function GET(req: Request) {
  const startedAt = new Date().toISOString();
  const url = new URL(req.url);
  const qSecret = url.searchParams.get('secret');
  const isVercelCron = !!req.headers.get('x-vercel-cron');
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  const bearerOk = !!secret && auth === `Bearer ${secret}`;
  const querySecretOk = !!secret && qSecret === secret;
  const noSecretEnv = !secret;

  console.log('[gcal cron] invoked', {
    startedAt,
    isVercelCron,
    bearerOk,
    querySecretOk,
    noSecretEnv,
    ua: req.headers.get('user-agent'),
  });

  if (!isVercelCron && !bearerOk && !querySecretOk && !noSecretEnv) {
    return NextResponse.json(
      { success: false, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const channels = await prisma.myChannel.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  let ok = 0;
  let failed = 0;
  for (const c of channels) {
    try {
      await syncMyChannel(c.id);
      ok++;
    } catch (e) {
      failed++;
      console.error('[gcal cron]', c.id, (e as Error).message);
    }
  }

  // 별표 안 한 영상 중 7일 지난 거 자동 정리 (DB 용량 절약)
  const cleanupCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let cleanedVideos = 0;
  try {
    const r = await prisma.video.deleteMany({
      where: {
        isStarred: false,
        fetchedAt: { lt: cleanupCutoff },
      },
    });
    cleanedVideos = r.count;
  } catch (e) {
    console.error('[video cleanup] failed', (e as Error).message);
  }

  const finishedAt = new Date().toISOString();
  console.log('[gcal cron] done', {
    startedAt,
    finishedAt,
    allChannels: channels.length,
    calSynced: ok,
    calFailed: failed,
    cleanedVideos,
  });

  return NextResponse.json({
    success: true,
    data: {
      allChannels: channels.length,
      calSynced: ok,
      calFailed: failed,
      cleanedVideos,
    },
  });
}
