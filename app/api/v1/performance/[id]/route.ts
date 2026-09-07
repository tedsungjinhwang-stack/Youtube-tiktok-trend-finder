import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const STATES = new Set(['public', 'scheduled', 'private']);

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: {
    title?: string;
    uploadedAt?: Date;
    state?: string;
    views?: number | null;
    note?: string | null;
  } = {};
  if (typeof body.title === 'string') data.title = body.title.trim();
  if (typeof body.uploadedAt === 'string' && body.uploadedAt) {
    data.uploadedAt = new Date(body.uploadedAt);
  }
  if (STATES.has(body.state)) data.state = body.state;
  // 빈 칸으로 지우는 것과 '안 건드림' 을 구분해야 해서 키 존재로 판단한다
  if ('views' in body) {
    data.views = Number.isFinite(body.views) ? Math.trunc(body.views) : null;
  }
  if ('note' in body) data.note = body.note?.trim() || null;

  try {
    await prisma.perfEntry.update({ where: { id }, data });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'UPDATE_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.perfEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const err = e as { code?: string };
    // 이미 지워졌으면 성공으로 본다
    if (err.code === 'P2025') return NextResponse.json({ success: true });
    return NextResponse.json(
      { success: false, error: { code: 'DELETE_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
