import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function isMissingTable(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /relation .* does not exist|P2021|table .* does not exist/i.test(msg);
}

export async function GET() {
  try {
    const channels = await prisma.myChannel.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        videos: { orderBy: { scheduledAt: 'asc' } },
        youtubeOauth: {
          select: {
            id: true,
            youtubeChannelName: true,
            accountEmail: true,
            lastSyncedAt: true,
            lastSyncError: true,
          },
        },
      },
    });
    return NextResponse.json({ success: true, data: channels });
  } catch (e) {
    if (isMissingTable(e)) {
      // ChannelYouTubeOAuth 만 없는 경우 → include 없이 재시도
      try {
        const channels = await prisma.myChannel.findMany({
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { videos: { orderBy: { scheduledAt: 'asc' } } },
        });
        return NextResponse.json({
          success: true,
          data: channels.map((c) => ({ ...c, youtubeOauth: null })),
          warning:
            'YouTube 동기화 테이블 (ChannelYouTubeOAuth) 미생성. 새 마이그레이션 SQL 을 실행해주세요.',
        });
      } catch {
        return NextResponse.json({
          success: true,
          data: [],
          warning:
            'DB 마이그레이션 미실행: MyChannel 테이블이 없습니다. Supabase SQL Editor 에서 마이그레이션 SQL 을 실행해주세요.',
        });
      }
    }
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, category, url } = body as {
    name?: string;
    category?: string;
    url?: string;
  };
  const trimmedName = name?.trim() || '';
  try {
    // 이름 중복 체크 (대소문자 무시). 비어있으면 패스 (YouTube 가 자동 채움)
    if (trimmedName) {
      const existing = await prisma.myChannel.findFirst({
        where: { name: { equals: trimmedName, mode: 'insensitive' } },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'DUPLICATE_NAME',
              message: `같은 이름의 채널이 이미 있습니다: "${existing.name}"`,
            },
          },
          { status: 409 }
        );
      }
    }
    const max = await prisma.myChannel.aggregate({ _max: { sortOrder: true } });
    const created = await prisma.myChannel.create({
      data: {
        name: trimmedName || '(미설정)',
        category: category?.trim() || null,
        url: url?.trim() || null,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MIGRATION_NEEDED',
            message:
              'DB 마이그레이션 미실행. Supabase SQL Editor 에서 MyChannel/ScheduledVideo/GoogleOAuth 테이블을 만든 뒤 다시 시도하세요.',
          },
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
