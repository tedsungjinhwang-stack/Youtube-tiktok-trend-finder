import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

/** YouTube 연결 + 활성인 모든 채널의 예약 영상을 일괄 가져옴 */
export async function POST() {
  const oauths = await prisma.channelYouTubeOAuth.findMany({
    where: { myChannel: { isActive: true } },
  });
  if (oauths.length === 0) {
    return NextResponse.json({
      success: true,
      data: { synced: 0, total: 0, totalVideos: 0 },
    });
  }
  let ok = 0;
  let totalVideos = 0;
  for (const o of oauths) {
    try {
      const count = await syncChannelScheduled(o.id);
      totalVideos += count;
      await syncMyChannel(o.myChannelId).catch(() => {});
      ok++;
    } catch (e) {
      await prisma.channelYouTubeOAuth.update({
        where: { id: o.id },
        data: { lastSyncError: (e as Error).message },
      }).catch(() => {});
    }
  }
  return NextResponse.json({
    success: true,
    data: { synced: ok, total: oauths.length, totalVideos },
  });
}
