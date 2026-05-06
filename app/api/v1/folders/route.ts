import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';

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

  // Mock data — Phase 2 will read from prisma.folder.findMany().
  return NextResponse.json({
    success: true,
    data: FOLDER_SEED.map((name, i) => ({
      id: `seed-${i}`,
      name,
      sortOrder: i,
      isSeeded: true,
      channelCount: 0,
    })),
    meta: { total: FOLDER_SEED.length },
  });
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

  // Mock create.
  return NextResponse.json(
    {
      success: true,
      data: {
        id: `mock-${Date.now()}`,
        name: parsed.data.name,
        sortOrder: 99,
        isSeeded: false,
        channelCount: 0,
      },
    },
    { status: 201 }
  );
}
