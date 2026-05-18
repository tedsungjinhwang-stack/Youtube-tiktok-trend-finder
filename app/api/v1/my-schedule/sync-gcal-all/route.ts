import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

/** 모든 활성 채널의 GCal 이벤트를 강제로 일괄 동기화 */
export async function POST() {
  const auth = await prisma.googleOAuth.findUnique({ where: { id: 'default' } });
  if (!auth) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NO_GCAL', message: 'Google 캘린더 미연결' },
      },
      { status: 400 }
    );
  }
  const channels = await prisma.myChannel.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  let ok = 0;
  for (const c of channels) {
    try {
      await syncMyChannel(c.id);
      ok++;
    } catch {
      /* best-effort */
    }
  }
  return NextResponse.json({
    success: true,
    data: { synced: ok, total: channels.length },
  });
}
