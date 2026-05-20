import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

/**
 * 전체 동기화:
 *  1) YouTube 연결된 활성 채널: YT → DB (예약 영상 fetch + 게시된 거 정리)
 *  2) 모든 활성 채널: DB → Google Calendar (수동 채널까지 다 캘린더 반영)
 */
export async function POST() {
  // 1) YouTube fetch
  const oauths = await prisma.channelYouTubeOAuth.findMany({
    where: { myChannel: { isActive: true } },
  });
  let ytOk = 0;
  let totalVideos = 0;
  for (const o of oauths) {
    try {
      const count = await syncChannelScheduled(o.id);
      totalVideos += count;
      ytOk++;
    } catch (e) {
      await prisma.channelYouTubeOAuth
        .update({
          where: { id: o.id },
          data: { lastSyncError: (e as Error).message },
        })
        .catch(() => {});
    }
  }

  // 2) 모든 활성 채널 캘린더 동기화 (수동 채널 포함)
  const allActive = await prisma.myChannel.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  let calOk = 0;
  for (const c of allActive) {
    try {
      await syncMyChannel(c.id);
      calOk++;
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      ytChannels: oauths.length,
      ytSynced: ytOk,
      totalVideos,
      calChannels: allActive.length,
      calSynced: calOk,
      // 기존 UI 호환: synced/total 도 채워줌 (YT 기준)
      synced: ytOk,
      total: oauths.length,
    },
  });
}
