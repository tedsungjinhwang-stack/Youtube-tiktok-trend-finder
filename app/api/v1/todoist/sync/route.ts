import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncAllToTodoist, syncChannelToTodoist } from '@/lib/todoist';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const channelId = body.channelId as string | undefined;
  try {
    if (channelId) {
      const tasks = await syncChannelToTodoist(channelId);
      return NextResponse.json({ success: true, data: { tasks } });
    }
    const r = await syncAllToTodoist();
    return NextResponse.json({ success: true, data: r });
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.todoistConfig
      .update({ where: { id: 'default' }, data: { lastSyncError: msg } })
      .catch(() => {});
    return NextResponse.json({ success: false, error: { code: 'SYNC_FAILED', message: msg } }, { status: 502 });
  }
}
