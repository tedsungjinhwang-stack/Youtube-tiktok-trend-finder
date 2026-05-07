import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCredSync, maskCred } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

type KeyRow = {
  id: string;
  label: string;
  preview: string;
  used: number;
  limit: number;
  status: 'active' | 'exhausted';
  source: 'db' | 'env';
};

export async function GET() {
  const rows: KeyRow[] = [];
  try {
    const dbRows = await prisma.youtubeApiKey.findMany({
      orderBy: { createdAt: 'asc' },
    });
    for (const k of dbRows) {
      rows.push({
        id: k.id,
        label: k.label,
        preview: maskCred(k.apiKey) ?? '***',
        used: k.usedToday,
        limit: k.dailyQuotaLimit,
        status: k.exhaustedAt && (!k.resetAt || k.resetAt > new Date()) ? 'exhausted' : 'active',
        source: 'db',
      });
    }
  } catch {
    /* DB not connected — fall through to env */
  }

  if (rows.length === 0) {
    const envKey = getCredSync('YOUTUBE_API_KEY');
    if (envKey) {
      rows.push({
        id: 'env',
        label: 'env (.env 폴백)',
        preview: maskCred(envKey) ?? '***',
        used: 0,
        limit: 10000,
        status: 'active',
        source: 'env',
      });
    }
  }

  return NextResponse.json({ success: true, data: rows });
}

const PostSchema = z.object({
  label: z.string().min(1).max(40),
  apiKey: z.string().min(20).max(200),
  dailyQuotaLimit: z.number().int().positive().max(1_000_000).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      { status: 400 }
    );
  }
  try {
    const created = await prisma.youtubeApiKey.create({
      data: {
        label: parsed.data.label,
        apiKey: parsed.data.apiKey,
        dailyQuotaLimit: parsed.data.dailyQuotaLimit ?? 10000,
      },
    });
    return NextResponse.json({ success: true, data: { id: created.id } });
  } catch (e) {
    const msg = (e as Error).message;
    const isDup = /Unique|unique/.test(msg);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isDup ? 'DUPLICATE' : 'DB_ERROR',
          message: isDup ? '이미 등록된 키입니다.' : msg,
        },
      },
      { status: isDup ? 409 : 500 }
    );
  }
}
