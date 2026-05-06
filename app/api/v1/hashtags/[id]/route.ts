import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { removeHashtag, toggleHashtag } from '@/lib/hashtags';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      { status: 400 }
    );
  }
  const row = toggleHashtag(params.id, parsed.data.isActive);
  if (!row) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Unknown hashtag' } },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ok = removeHashtag(params.id);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Unknown hashtag' } },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, data: { id: params.id } });
}
