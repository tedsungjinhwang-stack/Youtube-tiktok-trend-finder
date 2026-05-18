import { NextResponse } from 'next/server';
import { syncMyChannel } from '@/lib/google/calendar';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** 캘린더 이벤트 강제 재동기화 (현재 채널 상태로 upsert) */
export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const auth = await prisma.googleOAuth.findUnique({ where: { id: 'default' } });
  if (!auth) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'NO_GCAL', message: 'Google 캘린더 연결 안 됨 (좌측 하단 연결 먼저)' },
      },
      { status: 400 }
    );
  }
  await syncMyChannel(id);
  return NextResponse.json({ success: true });
}
