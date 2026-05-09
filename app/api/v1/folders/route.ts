import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FOLDER_SEED = [
  '영드짜', '해외 영드짜', '예능짜집기', '인스타 틱톡 짜집기', '잡학상식',
  '국뽕', '블랙박스', '해짜 (동물)', '해짜 | 정보', '게임 | 롤',
  '고래', '아이돌 팬튜브', '감동', '대기업', '스포츠 | 커뮤',
  '아기', '애니 | 짤형', '요리', '커뮤형',
];

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }

  try {
    // Prisma startsWith가 LIKE '__%'로 풀려 모든 행을 매치하므로 JS 필터 사용
    const all = await prisma.folder.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { channels: true } } },
    });
    const folders = all.filter((f) => !f.name.startsWith('__'));
    return NextResponse.json({
      success: true,
      data: folders.map((f) => ({
        id: f.id,
        name: f.name,
        sortOrder: f.sortOrder,
        isSeeded: f.isSeeded,
        channelCount: f._count.channels,
      })),
      meta: { total: folders.length },
    });
  } catch {
    // DB not connected — return mock seed list
    return NextResponse.json({
      success: true,
      data: FOLDER_SEED.map((name, i) => ({
        id: `seed-${i}`,
        name,
        sortOrder: i,
        isSeeded: true,
        channelCount: 0,
      })),
      meta: { total: FOLDER_SEED.length, mock: true },
    });
  }
}

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(50),
});

export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateFolderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      { status: 400 }
    );
  }

  try {
    const last = await prisma.folder.findFirst({ orderBy: { sortOrder: 'desc' } });
    const folder = await prisma.folder.create({
      data: { name: parsed.data.name, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    return NextResponse.json(
      {
        success: true,
        data: { ...folder, channelCount: 0 },
      },
      { status: 201 }
    );
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: '같은 이름의 폴더가 있습니다.' } },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: 'DB 연결 필요' } },
      { status: 503 }
    );
  }
}
