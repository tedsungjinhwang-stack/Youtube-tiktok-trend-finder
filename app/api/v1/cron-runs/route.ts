import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' } as const;

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name') ?? undefined;
  const limit = Math.min(
    50,
    Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 10))
  );

  try {
    const rows = await prisma.cronRun.findMany({
      where: name ? { name } : {},
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({ success: true, data: rows }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { success: false, data: [], error: (e as Error).message },
      { headers: NO_STORE }
    );
  }
}
