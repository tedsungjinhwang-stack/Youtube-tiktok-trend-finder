import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  folderId: z.string().optional(),
  folderName: z.string().optional(),
  platform: z.enum(['YOUTUBE', 'TIKTOK', 'INSTAGRAM']).optional(),
  period: z.enum(['24h', '7d', '30d', 'all']).default('7d'),
  sortBy: z.enum(['viralScore', 'views', 'publishedAt']).default('viralScore'),
  minScore: z.coerce.number().default(3),
  minViews: z.coerce.number().default(50000),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      { status: 400 }
    );
  }
  const q = parsed.data;

  try {
    const sinceMap: Record<string, Date | null> = {
      '24h': new Date(Date.now() - 24 * 60 * 60 * 1000),
      '7d': new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      '30d': new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      all: null,
    };
    const since = sinceMap[q.period];

    const folderId = q.folderId
      ?? (q.folderName
        ? (await prisma.folder.findUnique({ where: { name: q.folderName } }))?.id
        : undefined);

    const orderBy =
      q.sortBy === 'viralScore'
        ? { viralScore: 'desc' as const }
        : q.sortBy === 'views'
          ? { viewCount: 'desc' as const }
          : { publishedAt: 'desc' as const };

    const rows = await prisma.video.findMany({
      where: {
        ...(q.platform ? { platform: q.platform } : {}),
        ...(since ? { publishedAt: { gte: since } } : {}),
        viewCount: { gte: BigInt(q.minViews) },
        viralScore: { gte: q.minScore },
        ...(folderId ? { channel: { folderId } } : {}),
      },
      orderBy,
      take: q.limit,
      ...(q.cursor ? { skip: 1, cursor: { id: q.cursor } } : {}),
      include: {
        channel: {
          select: {
            displayName: true,
            handle: true,
            folder: { select: { name: true } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: rows.map((v) => ({
        id: v.id,
        platform: v.platform,
        externalId: v.externalId,
        url: v.url,
        title: v.caption,
        thumbnailUrl: v.thumbnailUrl,
        viewCount: v.viewCount.toString(),
        likeCount: v.likeCount,
        durationSeconds: v.durationSeconds,
        isShorts: v.isShorts,
        publishedAt: v.publishedAt,
        viralScore: v.viralScore,
        channelName: v.channel.displayName,
        channelHandle: v.channel.handle,
        folder: v.channel.folder.name,
      })),
      meta: {
        total: rows.length,
        filters: q,
        nextCursor: rows.length === q.limit ? rows[rows.length - 1].id : null,
      },
    });
  } catch {
    return NextResponse.json({
      success: true,
      data: [],
      meta: { total: 0, mock: true, filters: q, nextCursor: null },
    });
  }
}
