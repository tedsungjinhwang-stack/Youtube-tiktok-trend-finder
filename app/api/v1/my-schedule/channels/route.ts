import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const channels = await prisma.myChannel.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      videos: { orderBy: { scheduledAt: 'asc' } },
    },
  });
  return NextResponse.json({ success: true, data: channels });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, category, url } = body as {
    name?: string;
    category?: string;
    url?: string;
  };
  if (!name?.trim()) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: '채널명 필수' } },
      { status: 400 }
    );
  }
  const max = await prisma.myChannel.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.myChannel.create({
    data: {
      name: name.trim(),
      category: category?.trim() || null,
      url: url?.trim() || null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  return NextResponse.json({ success: true, data: created });
}
