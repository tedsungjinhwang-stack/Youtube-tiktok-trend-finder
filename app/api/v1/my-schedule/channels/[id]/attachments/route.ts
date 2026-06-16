import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_PER_CHANNEL = 5;

type Ctx = { params: Promise<{ id: string }> };

/**
 * 첨부 생성 — 클라이언트가 Cloudinary 에 직접 업로드한 뒤 secure_url 을 보내옴.
 * 이 라우트는 그 URL 을 DB 에 저장만 함 (Vercel 4MB 본문 한도 우회).
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const label = typeof body.label === 'string' ? body.label.trim() || null : null;
  if (!url) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_URL', message: 'url 누락' } },
      { status: 400 }
    );
  }
  try {
    const count = await prisma.channelAttachment.count({ where: { channelId: id } });
    if (count >= MAX_PER_CHANNEL) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'LIMIT_REACHED',
            message: `채널당 최대 ${MAX_PER_CHANNEL}개 — 기존 첨부를 삭제하고 다시 업로드하세요.`,
          },
        },
        { status: 400 }
      );
    }
    const created = await prisma.channelAttachment.create({
      data: { channelId: id, url, label },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
