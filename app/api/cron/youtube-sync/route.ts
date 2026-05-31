import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

/**
 * Daily cron — 모든 YouTube 연결 채널의 예약 영상을 가져와 ScheduledVideo upsert
 * + 채널 단위 1개 GCal 이벤트 upsert.
 * 실행 결과는 CronRun 테이블에 기록 (도는지/언제 도는지 확인용).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  const run = await prisma.cronRun
    .create({ data: { name: 'youtube-sync', status: 'RUNNING' } })
    .catch(() => null);

  const ytResults: Array<{ channelId: string; count?: number; error?: string }> = [];
  let ytOk = 0;

  try {
    // 1) YouTube 연결 + isActive 채널만: YouTube → DB
    const oauths = await prisma.channelYouTubeOAuth.findMany({
      where: { myChannel: { isActive: true } },
    });
    for (const o of oauths) {
      try {
        const count = await syncChannelScheduled(o.id);
        ytResults.push({ channelId: o.myChannelId, count });
        ytOk++;
      } catch (e) {
        const msg = (e as Error).message;
        console.error('[yt cron]', o.myChannelId, msg);
        await prisma.channelYouTubeOAuth
          .update({ where: { id: o.id }, data: { lastSyncError: msg } })
          .catch(() => {});
        ytResults.push({ channelId: o.myChannelId, error: msg });
      }
    }

    // 2) 모든 활성 채널: DB → Google Calendar
    const allChannels = await prisma.myChannel.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    let calOk = 0;
    const calErrors: string[] = [];
    for (const c of allChannels) {
      try {
        await syncMyChannel(c.id);
        calOk++;
      } catch (e) {
        const msg = (e as Error).message;
        console.error('[gcal cron]', c.id, msg);
        calErrors.push(`${c.id}: ${msg.slice(0, 120)}`);
      }
    }

    if (run) {
      await prisma.cronRun
        .update({
          where: { id: run.id },
          data: {
            status: 'OK',
            finishedAt: new Date(),
            ytChannels: oauths.length,
            ytSynced: ytOk,
            calChannels: allChannels.length,
            calSynced: calOk,
            meta: JSON.stringify({
              ytResults: ytResults.slice(0, 50),
              calErrors: calErrors.slice(0, 20),
            }),
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        ytChannels: oauths.length,
        ytSynced: ytOk,
        calChannels: allChannels.length,
        calSynced: calOk,
        results: ytResults,
        calErrors,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('[cron youtube-sync fatal]', msg);
    if (run) {
      await prisma.cronRun
        .update({
          where: { id: run.id },
          data: { status: 'FAILED', finishedAt: new Date(), error: msg.slice(0, 500) },
        })
        .catch(() => {});
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
