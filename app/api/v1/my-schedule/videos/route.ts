import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json();
  const { channelId, title, scheduledAt, notes } = body as {
    channelId?: string;
    title?: string;
    scheduledAt?: string;
    notes?: string;
  };
  if (!channelId || !scheduledAt) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: 'channelId, scheduledAt 필수' } },
      { status: 400 }
    );
  }
  const created = await prisma.scheduledVideo.create({
    data: {
      channelId,
      title: title?.trim() || '',
      scheduledAt: new Date(scheduledAt),
      notes: notes?.trim() || null,
    },
  });
  syncMyChannel(channelId).catch(() => {});
  return NextResponse.json({ success: true, data: created });
}
