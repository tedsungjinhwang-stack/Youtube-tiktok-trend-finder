import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PlatformEnum = z.enum(['YOUTUBE', 'TIKTOK', 'INSTAGRAM']);

const CreateChannelSchema = z.object({
  platform: PlatformEnum,
  handle: z.string().min(1),
  folderId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }
  // Mock empty list.
  return NextResponse.json({
    success: true,
    data: [],
    meta: {
      total: 0,
      filters: {
        folderId: req.nextUrl.searchParams.get('folderId'),
        platform: req.nextUrl.searchParams.get('platform'),
      },
    },
  });
}

export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = CreateChannelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      { status: 400 }
    );
  }
  return NextResponse.json(
    {
      success: true,
      data: {
        id: `mock-${Date.now()}`,
        ...parsed.data,
        externalId: parsed.data.handle,
        isActive: true,
      },
    },
    { status: 201 }
  );
}
