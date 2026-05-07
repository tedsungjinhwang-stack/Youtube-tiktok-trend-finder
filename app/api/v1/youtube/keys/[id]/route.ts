import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (params.id === 'env') {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_EDITABLE', message: 'env 키는 .env에서 제거하세요.' } },
      { status: 400 }
    );
  }
  try {
    await prisma.youtubeApiKey.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: (e as Error).message } },
      { status: 404 }
    );
  }
}
