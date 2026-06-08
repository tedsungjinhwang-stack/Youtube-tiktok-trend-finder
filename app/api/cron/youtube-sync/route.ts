import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

/**
 * Daily cron (KST 02:00 = UTC 17:00) — 캘린더 동기화 전용.
 *
 * YT 자동 동기화는 사용자의 수기 수정을 덮어쓰는 문제 때문에 제거.
 * 이 cron 은 활성 채널의 DB 예약 데이터를 그대로 Google Calendar 에 반영만 함.
 * (영상 0개 채널은 오늘 종일 "영상업로드 필요" 이벤트로 갱신)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  const channels = await prisma.myChannel.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  let ok = 0;
  let failed = 0;
  for (const c of channels) {
    try {
      await syncMyChannel(c.id);
      ok++;
    } catch (e) {
      failed++;
      console.error('[gcal cron]', c.id, (e as Error).message);
    }
  }

  return NextResponse.json({
    success: true,
    data: { allChannels: channels.length, calSynced: ok, calFailed: failed },
  });
}
