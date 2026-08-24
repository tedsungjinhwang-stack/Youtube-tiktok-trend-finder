import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
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

  // 예약 → 구글 캘린더 직접 동기화. 연결이 없으면 할 일이 없으므로 실패로 알린다.
  const gauth = await prisma.googleOAuth.findUnique({ where: { id: 'default' } }).catch(() => null);
  if (!gauth) {
    return NextResponse.json({
      success: false,
      error: 'NO_GOOGLE',
      hint: '설정에서 구글 캘린더를 연결해주세요.',
    }, { status: 503 });
  }

  let channels: Array<{ id: string; name: string; youtubeOauth: { id: string } | null }>;
  try {
    channels = await prisma.myChannel.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        youtubeOauth: { select: { id: true } },
      },
    });
  } catch (e) {
    // 여기서 던지면 처리 안 된 500 이 나가서 cron 알림만 오고 원인을 알 수 없었다.
    console.error('[cron] 채널 조회 실패', (e as Error).message);
    return NextResponse.json(
      { success: false, error: 'DB_QUERY_FAILED', message: (e as Error).message },
      { status: 500 }
    );
  }
  let ytSynced = 0;
  let ytFailed = 0;
  const failedDetails: Array<{ name: string; reason: string }> = [];
  // 1) YouTube 연결된 채널: 예약 업로드 먼저 가져옴 (youtubeVideoId 있는 것만 갱신 — 수동 예약은 안 건드림)
  for (const c of channels) {
    if (!c.youtubeOauth) continue;
    try {
      await syncChannelScheduled(c.youtubeOauth.id);
      ytSynced++;
    } catch (e) {
      ytFailed++;
      const reason = `YT: ${(e as Error).message.slice(0, 100)}`;
      failedDetails.push({ name: c.name, reason });
      console.error('[yt cron]', c.id, reason);
    }
  }
  // 2) DB 예약 → Google Calendar: 채널마다 예약 건수만큼 이벤트를 다시 만든다.
  //    Todoist 로 우회하던 걸 걷어냈다 — Todoist→캘린더 구간은 우리가 손댈 수 없어서
  //    반영이 안 될 때 원인을 못 잡았다. 할 일 카드용 Todoist 연동은 그대로 남는다.
  let calSynced = 0;
  let calFailed = 0;
  for (const c of channels) {
    try {
      await syncMyChannel(c.id);
      calSynced++;
    } catch (e) {
      calFailed++;
      const reason = `CAL: ${(e as Error).message.slice(0, 100)}`;
      failedDetails.push({ name: c.name, reason });
      console.error('[gcal cron]', c.id, reason);
    }
  }

  // 별표(관심영상) 안 한 영상 중 30일 지난 거 자동 정리 (DB 용량 절약).
  // 사용자가 관심영상 체크했으면 30일 지나도 유지.
  const cleanupCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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
    calSynced,
    calFailed,
    cleanedVideos,
  });

  // 한 채널이라도 캘린더 반영에 실패했으면 200 을 주면 안 된다.
  // 예전엔 실패해도 200 이라 cron 대시보드가 초록으로 떠 며칠씩 모르고 지나갔다.
  const body = {
    success: calFailed === 0,
    ...(calFailed > 0 ? { error: 'CALENDAR_SYNC_FAILED' } : {}),
    data: {
      allChannels: channels.length,
      calendar: { synced: calSynced, failed: calFailed },
      ytSynced,
      ytFailed,
      cleanedVideos,
      ...(failedDetails.length > 0 ? { failures: failedDetails.slice(0, 10) } : {}),
    },
  };
  return NextResponse.json(body, { status: calFailed > 0 ? 500 : 200 });
}
