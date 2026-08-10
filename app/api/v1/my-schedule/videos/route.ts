import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelToTodoist } from '@/lib/todoist';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json();
  const { channelId, title, scheduledAt, notes, publishedUrl, replace } = body as {
    channelId?: string;
    title?: string;
    scheduledAt?: string;
    notes?: string;
    /** 스레드처럼 예약이 아니라 이미 올린 글을 기록할 때 바로 넣는 링크 */
    publishedUrl?: string;
    /** true 면 이 채널의 미래 예약을 모두 지우고 새로 만듦 (채널당 1예약 — 빠른추가용) */
    replace?: boolean;
  };
  if (!channelId || !scheduledAt) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: 'channelId, scheduledAt 필수' } },
      { status: 400 }
    );
  }
  try {
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
        publishedUrl: publishedUrl?.trim() || null,
      },
    });
    syncChannelToTodoist(channelId).catch(() => {});
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'CREATE_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
