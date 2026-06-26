import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runPreset } from '@/lib/presets/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }
  const { id } = await params;
  const preset = await prisma.scrapePreset.findUnique({ where: { id } });
  if (!preset) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND' } },
      { status: 404 }
    );
  }
  try {
    const result = await runPreset(preset);
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'RUN_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
