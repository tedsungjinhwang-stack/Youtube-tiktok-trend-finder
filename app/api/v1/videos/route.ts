import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  folderId: z.string().optional(),
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

  return NextResponse.json({
    success: true,
    data: [],
    meta: {
      total: 0,
      filters: parsed.data,
      nextCursor: null,
    },
  });
}
