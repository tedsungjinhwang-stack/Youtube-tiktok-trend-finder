import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncScheduledVideo, unsyncScheduledVideo } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const data: {
    title?: string;
    notes?: string | null;
    scheduledAt?: Date;
    status?: string;
  } = {};
  if (typeof body.title === 'string') data.title = body.title.trim();
  if ('notes' in body) data.notes = body.notes?.trim() || null;
  if (typeof body.scheduledAt === 'string')
    data.scheduledAt = new Date(body.scheduledAt);
  if (typeof body.status === 'string') data.status = body.status;
  const updated = await prisma.scheduledVideo.update({ where: { id }, data });
  syncScheduledVideo(updated.id).catch(() => {});
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await unsyncScheduledVideo(id).catch(() => {});
  await prisma.scheduledVideo.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
