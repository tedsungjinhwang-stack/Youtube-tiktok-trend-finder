import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string') data.name = body.name.trim();
  if ('folderId' in body) data.folderId = body.folderId || null;
  if (typeof body.platform === 'string') data.platform = body.platform;
  if (typeof body.kind === 'string') data.kind = body.kind;
  if ('recencyDays' in body)
    data.recencyDays = body.recencyDays == null || body.recencyDays === '' ? null : Number(body.recencyDays);
  if ('minAgeDays' in body)
    data.minAgeDays = body.minAgeDays == null || body.minAgeDays === '' ? null : Number(body.minAgeDays);
  if ('minViews' in body) data.minViews = Number(body.minViews) || 0;
  if (typeof body.videoType === 'string') data.videoType = body.videoType;
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled;

  try {
    const updated = await prisma.scrapePreset.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  const { id } = await params;
  try {
    await prisma.scrapePreset.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'P2025') return NextResponse.json({ success: true, warning: 'already deleted' });
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
