import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { label?: string | null } = {};
  if ('label' in body) data.label = body.label?.trim() || null;
  try {
    const updated = await prisma.channelAttachment.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}

/**
 * 첨부 삭제 — DB 레코드만 제거.
 * Cloudinary 의 실제 파일은 그대로 남음 (월 25GB 한도 신경쓰지 않으면 OK).
 * 정리하려면 Cloudinary 대시보드 → Media Library 에서 직접 삭제.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.channelAttachment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
