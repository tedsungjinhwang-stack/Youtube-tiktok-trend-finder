import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
import { syncScheduledVideo } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

/**
 * Daily cron — 모든 YouTube 연결된 채널의 예약 영상을 가져와
 * ScheduledVideo upsert + Google Calendar 푸시.
 *
 * Vercel cron 은 CRON_SECRET 헤더로 보호 (선택사항).
 */
export async function GET(req: Request) {
  // Vercel cron 인증 (옵션)
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
      // 새로 들어온/업데이트된 영상을 캘린더 동기화
      const vids = await prisma.scheduledVideo.findMany({
        where: { channelId: o.myChannelId, youtubeVideoId: { not: null } },
      });
      for (const v of vids) {
        await syncScheduledVideo(v.id).catch(() => {});
      }
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
