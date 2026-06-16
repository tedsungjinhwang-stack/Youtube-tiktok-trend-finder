import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

/**
 * Daily cron (KST 02:00 = UTC 17:00) — Google Calendar 동기화 전용.
 * 활성 채널의 DB 예약 데이터를 Google Calendar 이벤트로 반영.
 * 예약 영상 0개 채널은 오늘 종일 "영상업로드 필요" 이벤트로 갱신.
 *
 * 인증:
 *   - Vercel cron 은 `x-vercel-cron` 헤더 자동 첨부 → 통과
 *   - 수동 호출 시 `Authorization: Bearer <CRON_SECRET>` 로 인증
 *   - CRON_SECRET 미설정 시 무인증 (개발/로컬)
 */
export async function GET(req: Request) {
  const startedAt = new Date().toISOString();
  const isVercelCron =
    req.headers.get('x-vercel-cron') === '1' ||
    !!req.headers.get('x-vercel-cron');
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  const bearerOk = !!secret && auth === `Bearer ${secret}`;
  const noSecretEnv = !secret;

  console.log('[gcal cron] invoked', {
    startedAt,
    isVercelCron,
    bearerOk,
    noSecretEnv,
    ua: req.headers.get('user-agent'),
  });

  if (!isVercelCron && !bearerOk && !noSecretEnv) {
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
