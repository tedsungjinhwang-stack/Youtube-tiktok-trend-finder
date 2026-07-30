import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncChannelToTodoist } from '@/lib/todoist';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const data: {
    title?: string;
    notes?: string | null;
    publishedUrl?: string | null;
    scheduledAt?: Date;
    status?: string;
  } = {};
  if (typeof body.title === 'string') data.title = body.title.trim();
  if ('notes' in body) data.notes = body.notes?.trim() || null;
  if ('publishedUrl' in body) data.publishedUrl = body.publishedUrl?.trim() || null;
  if (typeof body.scheduledAt === 'string')
    data.scheduledAt = new Date(body.scheduledAt);
  if (typeof body.status === 'string') data.status = body.status;
  const updated = await prisma.scheduledVideo.update({ where: { id }, data });
  syncChannelToTodoist(updated.channelId).catch(() => {});
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const before = await prisma.scheduledVideo.findUnique({ where: { id } });
  await prisma.scheduledVideo.delete({ where: { id } });
  if (before) syncChannelToTodoist(before.channelId).catch(() => {});
  return NextResponse.json({ success: true });
}
