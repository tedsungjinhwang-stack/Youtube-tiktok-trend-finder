import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_PER_CHANNEL = 10;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() || null : null;
  if (!url) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_URL', message: 'URL을 입력해주세요.' } },
      { status: 400 }
    );
  }
  try {
    const created = await prisma.$transaction(async (tx) => {
      // 채널당 최대 N개 유지 — 추가 후 N개 초과면 오래된 것부터 삭제 (FIFO)
      const newRow = await tx.channelMaterial.create({
        data: { channelId: id, url, note },
      });
      const all = await tx.channelMaterial.findMany({
        where: { channelId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const excess = all.length - MAX_PER_CHANNEL;
      if (excess > 0) {
        await tx.channelMaterial.deleteMany({
          where: { id: { in: all.slice(0, excess).map((m) => m.id) } },
        });
      }
      return newRow;
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
