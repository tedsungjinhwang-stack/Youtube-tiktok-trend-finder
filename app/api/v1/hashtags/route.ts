import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addHashtag, listHashtags } from '@/lib/hashtags';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, data: await listHashtags() });
}

const PostSchema = z.object({
  platform: z.enum(['TIKTOK', 'INSTAGRAM']),
  tag: z.string().min(1).max(64),
  folder: z.string().max(64).nullable().optional(),
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
    const row = await addHashtag({
      platform: parsed.data.platform,
      tag: parsed.data.tag,
      folder: parsed.data.folder ?? null,
    });
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'CONFLICT', message: (e as Error).message } },
      { status: 409 }
    );
  }
}
