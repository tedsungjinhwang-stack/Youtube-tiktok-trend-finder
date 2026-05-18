import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

/**
 * Daily cron — 모든 YouTube 연결 채널의 예약 영상을 가져와 ScheduledVideo upsert
 * + 채널 단위 1개 GCal 이벤트 upsert.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  const results: Array<{ channelId: string; count?: number; error?: string }> = [];

  // 1) YouTube 연결 + isActive 채널만: YouTube → DB
  const oauths = await prisma.channelYouTubeOAuth.findMany({
    where: { myChannel: { isActive: true } },
  });
  for (const o of oauths) {
    try {
      const count = await syncChannelScheduled(o.id);
      results.push({ channelId: o.myChannelId, count });
    } catch (e) {
      const msg = (e as Error).message;
      await prisma.channelYouTubeOAuth.update({
        where: { id: o.id },
        data: { lastSyncError: msg },
      }).catch(() => {});
      results.push({ channelId: o.myChannelId, error: msg });
    }
  }

  // 2) 모든 채널: DB → Google Calendar (영상 없는 채널은 오늘 "영상업로드 필요" 갱신)
  const allChannels = await prisma.myChannel.findMany({ select: { id: true } });
  for (const c of allChannels) {
    await syncMyChannel(c.id).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    data: { ytChannels: oauths.length, allChannels: allChannels.length, results },
  });
}
