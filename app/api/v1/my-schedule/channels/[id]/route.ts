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
    phone?: string | null;
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
  if ('phone' in body) data.phone = body.phone?.trim() || null;
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
  // 캘린더 이벤트는 best-effort 로 해제. 실패해도 DB 삭제는 진행.
  await unsyncMyChannel(id).catch((e) => {
    console.warn('[channel delete] unsync failed', id, (e as Error).message);
  });
  try {
    await prisma.myChannel.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    // P2025 = record not found → 이미 삭제됨, 성공으로 간주
    if (err.code === 'P2025') {
      return NextResponse.json({ success: true, warning: 'already deleted' });
    }
    console.error('[channel delete] failed', id, err.code, err.message);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: err.code ?? 'DB_ERROR',
          message: err.message ?? 'unknown error',
        },
      },
      { status: 500 }
    );
  }
}
