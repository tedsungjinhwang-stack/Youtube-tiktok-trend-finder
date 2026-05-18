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

  const oauths = await prisma.channelYouTubeOAuth.findMany();
  const results: Array<{ channelId: string; count?: number; error?: string }> = [];

  for (const o of oauths) {
    try {
      const count = await syncChannelScheduled(o.id);
      await syncMyChannel(o.myChannelId).catch(() => {});
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

  return NextResponse.json({
    success: true,
    data: { channels: oauths.length, results },
  });
}
