import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
import { syncAllToTodoist } from '@/lib/todoist';

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
  let tdSynced = 0;
  let tdFailed = 0;
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
  // 2) DB 예약 → Todoist: 전역 1회 동기화 (조회 1번 + 전부 삭제 + 채널당 생성).
  //    채널마다 돌던 예전 방식은 rate limit 으로 삭제가 실패해 매일 중복이 쌓였음.
  let tdGroups: Record<string, { tasks: number; total: number | null; project: string }> | null = null;
  let tdError: string | null = null;
  let orphansDeleted = 0;
  try {
    const r = await syncAllToTodoist();
    tdSynced = r.tasks;
    tdGroups = r.groups;
    orphansDeleted = r.orphansDeleted;
    // 그룹 단위 실패는 이제 throw 되지 않고 모여서 돌아온다. 하나라도 있으면 실패로 본다.
    const failed = Object.entries(r.groupErrors);
    if (failed.length > 0) {
      tdError = failed.map(([g, m]) => `${g}: ${m}`).join(' / ');
      tdFailed = failed.length;
      for (const [g, m] of failed) failedDetails.push({ name: g, reason: m });
    }
  } catch (e) {
    tdFailed = channels.length;
    tdError = (e as Error).message;
    const reason = `TD: ${tdError.slice(0, 100)}`;
    failedDetails.push({ name: '(전체)', reason });
    console.error('[todoist cron]', reason);
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
  console.log('[todoist cron] done', {
    startedAt,
    finishedAt,
    allChannels: channels.length,
    tdSynced,
    tdFailed,
    cleanedVideos,
  });

  // Todoist 동기화가 통째로 실패했으면 200 을 주면 안 된다.
  // 예전엔 여기서도 200 을 돌려줘서, 실제로는 아무것도 동기화되지 않았는데
  // cron 대시보드는 초록으로 떠 며칠씩 모르고 지나갔다.
  const body = {
    success: tdError === null,
    ...(tdError ? { error: 'TODOIST_SYNC_FAILED', message: tdError } : {}),
    data: {
      allChannels: channels.length,
      todoist: { synced: tdSynced, failed: tdFailed, groups: tdGroups, orphansDeleted },
      ytSynced,
      ytFailed,
      cleanedVideos,
      ...(failedDetails.length > 0 ? { failures: failedDetails.slice(0, 10) } : {}),
    },
  };
  return NextResponse.json(body, { status: tdError ? 500 : 200 });
}
