import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelScheduled } from '@/lib/google/youtube';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const oauth = await prisma.channelYouTubeOAuth.findUnique({
    where: { myChannelId: id },
  });
  if (!oauth) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_CONNECTED', message: 'YouTube 연결 안 됨' } },
      { status: 400 }
    );
  }
  try {
    const count = await syncChannelScheduled(oauth.id);
    await syncMyChannel(id).catch(() => {});
    return NextResponse.json({ success: true, data: { count } });
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.channelYouTubeOAuth.update({
      where: { id: oauth.id },
      data: { lastSyncError: msg },
    });
    return NextResponse.json(
      { success: false, error: { code: 'SYNC_FAILED', message: msg } },
      { status: 502 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.channelYouTubeOAuth.deleteMany({ where: { myChannelId: id } });
  return NextResponse.json({ success: true });
}
