import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel } from '@/lib/google/calendar';
import { getValidAccessToken } from '@/lib/google/oauth';

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

  // Preflight — OAuth 살아있는지 미리 확인. 죽었으면 채널 이벤트 다 날리지 않고 즉시 종료.
  const hasOAuth = await prisma.googleOAuth.findUnique({ where: { id: 'default' } }).catch(() => null);
  if (!hasOAuth) {
    return NextResponse.json({
      success: false,
      error: 'NO_GOOGLE_OAUTH',
      hint: '/my-schedule 페이지에서 Google 캘린더 연결을 먼저 해주세요.',
    }, { status: 200 });
  }
  const token = await getValidAccessToken();
  if (!token) {
    return NextResponse.json({
      success: false,
      error: 'OAUTH_EXPIRED',
      hint: 'Google OAuth refresh token 만료. /my-schedule 에서 연결 해제 → 재연결 필요.',
    }, { status: 200 });
  }

  const channels = await prisma.myChannel.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  let ok = 0;
  let failed = 0;
  const failedDetails: Array<{ name: string; reason: string }> = [];
  for (const c of channels) {
    try {
      await syncMyChannel(c.id);
      ok++;
    } catch (e) {
      failed++;
      const reason = (e as Error).message.slice(0, 120);
      failedDetails.push({ name: c.name, reason });
      console.error('[gcal cron]', c.id, reason);
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
      ...(failedDetails.length > 0 ? { failures: failedDetails.slice(0, 10) } : {}),
    },
  });
}
