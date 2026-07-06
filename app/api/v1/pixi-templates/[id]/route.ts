import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  const { id } = await params;
  try {
    await prisma.pixiTemplate.delete({ where: { id } });
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
