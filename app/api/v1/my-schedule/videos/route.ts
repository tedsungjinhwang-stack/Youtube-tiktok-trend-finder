import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json();
  const { channelId, title, scheduledAt, notes, replace } = body as {
    channelId?: string;
    title?: string;
    scheduledAt?: string;
    notes?: string;
    /** true 면 이 채널의 미래 예약을 모두 지우고 새로 만듦 (채널당 1예약 — 빠른추가용) */
    replace?: boolean;
  };
  if (!channelId || !scheduledAt) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: 'channelId, scheduledAt 필수' } },
      { status: 400 }
    );
  }
  if (replace) {
    await prisma.scheduledVideo
      .deleteMany({ where: { channelId, scheduledAt: { gte: new Date() } } })
      .catch(() => {});
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
