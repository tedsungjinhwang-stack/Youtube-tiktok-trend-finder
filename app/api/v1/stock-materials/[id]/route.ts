import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { url?: string; title?: string | null; description?: string | null; folderId?: string } = {};
  if (typeof body.url === 'string') data.url = body.url.trim();
  if ('title' in body) data.title = body.title?.trim() || null;
  if ('description' in body) data.description = body.description?.trim() || null;
  if (typeof body.folderId === 'string' && body.folderId.trim()) data.folderId = body.folderId.trim();
  try {
    const updated = await prisma.stockMaterial.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await prisma.stockMaterial.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
