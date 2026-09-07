import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const STATES = new Set(['public', 'scheduled', 'private']);

/** 업로드 매니저가 직접 적는 실적. 유튜브에서 가져오지 않는다. */
export async function GET() {
  try {
    const channels = await prisma.myChannel.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        platform: true,
        category: true,
        profile: true,
        url: true,
        perfEntries: { orderBy: { uploadedAt: 'desc' } },
      },
      orderBy: [{ platform: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json({ success: true, data: channels }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'LOAD_FAILED', message: (e as Error).message } },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const channelId = typeof body.channelId === 'string' ? body.channelId : '';
  const uploadedAt = typeof body.uploadedAt === 'string' ? body.uploadedAt : '';
  if (!channelId || !uploadedAt) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: '채널과 업로드 일시는 필수입니다.' } },
      { status: 400 }
    );
  }
  try {
    const created = await prisma.perfEntry.create({
      data: {
        channelId,
        title: typeof body.title === 'string' ? body.title.trim() : '',
        uploadedAt: new Date(uploadedAt),
        state: STATES.has(body.state) ? body.state : 'public',
        views: Number.isFinite(body.views) ? Math.trunc(body.views) : null,
        note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null,
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'CREATE_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
