import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
import { syncChannelToTodoist } from '@/lib/todoist';

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

  // Todoist 만 동기화 대상 (Google 캘린더 제거 — Todoist 가 자체 캘린더 연동으로 대체).
  const todoist = await prisma.todoistConfig.findUnique({ where: { id: 'default' } }).catch(() => null);
  if (!todoist) {
    return NextResponse.json({
      success: false,
      error: 'NO_TODOIST',
      hint: '/my-schedule 에서 Todoist 를 연결해주세요.',
    }, { status: 503 });
  }

  const channels = await prisma.myChannel.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      youtubeOauth: { select: { id: true } },
    },
  });
  let ytSynced = 0;
  let ytFailed = 0;
  let tdSynced = 0;
  let tdFailed = 0;
  const failedDetails: Array<{ name: string; reason: string }> = [];
  for (const c of channels) {
    // 1) YouTube 연결된 채널: 예약 업로드 먼저 가져옴 (youtubeVideoId 있는 것만 갱신 — 수동 예약은 안 건드림)
    if (c.youtubeOauth) {
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
    // 2) DB 예약 → Todoist 태스크 (채널당 1개, 없으면 '영상업로드 필요')
    try {
      await syncChannelToTodoist(c.id);
      tdSynced++;
    } catch (e) {
      tdFailed++;
      const reason = `TD: ${(e as Error).message.slice(0, 100)}`;
      failedDetails.push({ name: c.name, reason });
      console.error('[todoist cron]', c.id, reason);
    }
  }
  await prisma.todoistConfig
    .update({
      where: { id: 'default' },
      data: { lastSyncedAt: new Date(), lastSyncError: tdFailed > 0 ? `${tdFailed}개 채널 실패` : null },
    })
    .catch(() => {});

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
  console.log('[todoist cron] done', {
    startedAt,
    finishedAt,
    allChannels: channels.length,
    tdSynced,
    tdFailed,
    cleanedVideos,
  });

  return NextResponse.json({
    success: true,
    data: {
      allChannels: channels.length,
      todoist: { synced: tdSynced, failed: tdFailed, project: todoist.projectName },
      ytSynced,
      ytFailed,
      cleanedVideos,
      ...(failedDetails.length > 0 ? { failures: failedDetails.slice(0, 10) } : {}),
    },
  });
}
