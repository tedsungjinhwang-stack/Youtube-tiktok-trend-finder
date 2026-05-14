import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** TrendingSettings 조회 / 수정 (싱글톤). */

export async function GET() {
  const s = await ensure();
  const snapshotCount = await prisma.trendingSnapshot.count().catch(() => 0);
  const latestSnapshot = await prisma.trendingSnapshot
    .findFirst({ orderBy: { capturedAt: 'desc' }, select: { capturedAt: true } })
    .catch(() => null);
  return NextResponse.json({
    success: true,
    data: {
      ...s,
      snapshotCount,
      latestCapturedAt: latestSnapshot?.capturedAt ?? null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  let body: { enabled?: boolean; intervalHours?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY' } },
      { status: 400 }
    );
  }
  await ensure();
  const data: { enabled?: boolean; intervalHours?: number } = {};
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
  if (typeof body.intervalHours === 'number') {
    const n = Math.max(1, Math.min(24, Math.round(body.intervalHours)));
    data.intervalHours = n;
  }
  const updated = await prisma.trendingSettings.update({
    where: { id: 'default' },
    data,
  });
  return NextResponse.json({ success: true, data: updated });
}

async function ensure() {
  let s = await prisma.trendingSettings.findUnique({ where: { id: 'default' } });
  if (!s) {
    s = await prisma.trendingSettings.create({
      data: { id: 'default', enabled: true, intervalHours: 4 },
    });
  }
  return s;
}
