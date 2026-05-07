import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';
import { queryVideos } from '@/lib/queries/videos';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  folderId: z.string().optional(),
  folderName: z.string().optional(),
  platform: z.enum(['YOUTUBE', 'TIKTOK', 'INSTAGRAM']).optional(),
  period: z.enum(['24h', '48h', '7d', '30d', 'all']).default('7d'),
  minAgeDays: z.coerce.number().int().min(0).optional(),
  sortBy: z.enum(['viralScore', 'views', 'publishedAt']).default('viralScore'),
  minScore: z.coerce.number().optional(),
  pctScore: z.coerce.number().min(0).max(99).optional(),
  minViews: z.coerce.number().default(50000),
  q: z.string().trim().min(1).max(100).optional(),
  format: z
    .enum([
      'AI_GENERATED',
      'ORIGINAL',
      'MONTAGE',
      'COMPILATION',
      'HIGHLIGHT',
      'MEME_TEMPLATE',
      'STORY',
      'IMAGE_SLIDE',
      'UNDEFINED',
    ])
    .optional(),
  isShorts: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
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
    const result = await queryVideos(q);
    return NextResponse.json({
      success: true,
      data: result.rows,
      meta: {
        total: result.rows.length,
        filters: q,
        scoreThreshold: result.scoreThreshold,
        nextCursor: result.nextCursor,
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
