import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_PER_CHANNEL = 5;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() || null : null;
  if (!url) {
    return NextResponse.json(
      { success: false, error: { code: 'EMPTY', message: 'URL 또는 텍스트 입력' } },
      { status: 400 }
    );
  }
  try {
    const count = await prisma.channelAttachment.count({ where: { channelId: id } });
    if (count >= MAX_PER_CHANNEL) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'LIMIT_REACHED',
            message: `채널당 최대 ${MAX_PER_CHANNEL}개 — 기존 첨부를 삭제하고 다시 추가하세요.`,
          },
        },
        { status: 400 }
      );
    }
    const created = await prisma.channelAttachment.create({
      data: { channelId: id, url, label },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
