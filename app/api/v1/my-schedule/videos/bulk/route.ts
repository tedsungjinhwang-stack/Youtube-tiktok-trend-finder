import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' } as const;

/**
 * 여러 채널에 동일한 예약영상 일괄 생성.
 * body: { channelIds: string[], title?: string, scheduledAt: string, notes?: string }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { channelIds, title, scheduledAt, notes } = body as {
    channelIds?: string[];
    title?: string;
    scheduledAt?: string;
    notes?: string;
  };
  if (!Array.isArray(channelIds) || channelIds.length === 0 || !scheduledAt) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: 'channelIds, scheduledAt 필수' } },
      { status: 400, headers: NO_STORE }
    );
  }
  const date = new Date(scheduledAt);
  const created = await prisma.scheduledVideo.createMany({
    data: channelIds.map((channelId) => ({
      channelId,
      title: title?.trim() || '',
      scheduledAt: date,
      notes: notes?.trim() || null,
    })),
  });
  // 캘린더 동기화는 best-effort 병렬
  await Promise.all(channelIds.map((id) => syncMyChannel(id).catch(() => {})));
  return NextResponse.json(
    { success: true, data: { count: created.count } },
    { headers: NO_STORE }
  );
}

/**
 * 여러 채널의 예약영상 모두 삭제 (= "영상 업로드 필요" 상태로 만들기).
 * body: { channelIds: string[] }
 */
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { channelIds } = body as { channelIds?: string[] };
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: 'channelIds 필수' } },
      { status: 400, headers: NO_STORE }
    );
  }
  const deleted = await prisma.scheduledVideo.deleteMany({
    where: { channelId: { in: channelIds } },
  });
  await Promise.all(channelIds.map((id) => syncMyChannel(id).catch(() => {})));
  return NextResponse.json(
    { success: true, data: { count: deleted.count } },
    { headers: NO_STORE }
  );
}
