import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncMyChannel, unsyncMyChannel } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED_PLATFORMS = new Set(['YOUTUBE', 'INSTAGRAM', 'THREADS', 'NAVER_CLIP']);

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const data: {
    name?: string;
    platform?: string;
    category?: string | null;
    url?: string | null;
    adsense?: string | null;
    email?: string | null;
    isActive?: boolean;
  } = {};
  if (typeof body.name === 'string') data.name = body.name.trim();
  if (typeof body.platform === 'string' && ALLOWED_PLATFORMS.has(body.platform)) {
    data.platform = body.platform;
  }
  if ('category' in body) data.category = body.category?.trim() || null;
  if ('url' in body) data.url = body.url?.trim() || null;
  if ('adsense' in body) data.adsense = body.adsense?.trim() || null;
  if ('email' in body) data.email = body.email?.trim() || null;
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  const updated = await prisma.myChannel.update({ where: { id }, data });
  // 채널명 변경 또는 활성 상태 변경 → 캘린더 동기화 (비활성이면 syncMyChannel 안에서 스킵)
  if (data.name !== undefined || data.isActive !== undefined) {
    syncMyChannel(id).catch(() => {});
  }
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await unsyncMyChannel(id).catch(() => {});
  await prisma.myChannel.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
