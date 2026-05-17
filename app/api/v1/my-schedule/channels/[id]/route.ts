import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const data: { name?: string; category?: string | null; url?: string | null } = {};
  if (typeof body.name === 'string') data.name = body.name.trim();
  if ('category' in body) data.category = body.category?.trim() || null;
  if ('url' in body) data.url = body.url?.trim() || null;
  const updated = await prisma.myChannel.update({ where: { id }, data });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.myChannel.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
