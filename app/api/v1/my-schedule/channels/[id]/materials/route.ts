import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

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
    const created = await prisma.channelMaterial.create({
      data: { channelId: id, url, note },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
