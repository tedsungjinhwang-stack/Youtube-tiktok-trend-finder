import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseChannelInput } from '@/lib/url-parser';

export const dynamic = 'force-dynamic';

const PlatformEnum = z.enum(['YOUTUBE', 'TIKTOK', 'INSTAGRAM']);

const CreateChannelSchema = z.object({
  input: z.string().min(1).optional(), // raw URL or handle
  platform: PlatformEnum.optional(),
  handle: z.string().min(1).optional(),
  folderId: z.string().min(1).optional(),
  folderName: z.string().min(1).optional(),
});

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }

  const folderId = req.nextUrl.searchParams.get('folderId');
  const platform = req.nextUrl.searchParams.get('platform') as
    | 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | null;

  try {
    const rows = await prisma.channel.findMany({
      where: {
        ...(folderId ? { folderId } : {}),
        ...(platform ? { platform } : {}),
        isActive: true,
      },
      include: { folder: { select: { name: true } } },
      orderBy: { addedAt: 'desc' },
    });
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        externalId: r.externalId,
        handle: r.handle,
        displayName: r.displayName,
        folder: r.folder.name,
        folderId: r.folderId,
        subscriberCount: r.subscriberCount,
        lastScrapedAt: r.lastScrapedAt,
      })),
      meta: { total: rows.length, filters: { folderId, platform } },
    });
  } catch {
    return NextResponse.json({
      success: true,
      data: [],
      meta: { total: 0, mock: true, filters: { folderId, platform } },
    });
  }
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

  // Resolve platform/externalId/handle from either {input} or {platform, handle}
  let platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM';
  let externalId: string;
  let handle: string;

  if (parsed.data.input) {
    const r = parseChannelInput(parsed.data.input, parsed.data.platform);
    if ('error' in r) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: r.error } },
        { status: 400 }
      );
    }
    platform = r.platform;
    externalId = r.externalId;
    handle = r.handle;
  } else if (parsed.data.platform && parsed.data.handle) {
    const r = parseChannelInput(parsed.data.handle, parsed.data.platform);
    if ('error' in r) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: r.error } },
        { status: 400 }
      );
    }
    platform = r.platform;
    externalId = r.externalId;
    handle = r.handle;
  } else {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'input 또는 platform+handle 필요' } },
      { status: 400 }
    );
  }

  try {
    let folderId = parsed.data.folderId;
    if (!folderId && parsed.data.folderName) {
      const f = await prisma.folder.findUnique({ where: { name: parsed.data.folderName } });
      if (!f) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: '폴더 없음' } },
          { status: 404 }
        );
      }
      folderId = f.id;
    }
    if (!folderId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'folderId 또는 folderName 필요' } },
        { status: 400 }
      );
    }

    const ch = await prisma.channel.create({
      data: { platform, externalId, handle, folderId },
      include: { folder: { select: { name: true } } },
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          id: ch.id,
          platform: ch.platform,
          externalId: ch.externalId,
          handle: ch.handle,
          folder: ch.folder.name,
          folderId: ch.folderId,
          isActive: ch.isActive,
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: '이미 등록된 채널' } },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: 'DB 연결 필요' } },
      { status: 503 }
    );
  }
}
