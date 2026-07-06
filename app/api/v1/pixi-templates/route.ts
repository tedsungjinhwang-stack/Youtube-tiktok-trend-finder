import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function isMissingTable(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /relation .* does not exist|P2021|does not exist/i.test(msg);
}

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  try {
    const rows = await prisma.pixiTemplate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json({
        success: true,
        data: [],
        warning: 'DB 마이그레이션 미실행 (PixiTemplate). Supabase SQL Editor 에서 실행하세요.',
      });
    }
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? '').toString().trim() || '내 템플릿';
  const style = body.style;
  if (!style || typeof style !== 'object') {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'style 필요' } },
      { status: 400 }
    );
  }
  try {
    const max = await prisma.pixiTemplate.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.pixiTemplate.create({
      data: { name, style, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
