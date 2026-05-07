import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FORMATS = [
  'AI_GENERATED',
  'ORIGINAL',
  'MONTAGE',
  'COMPILATION',
  'HIGHLIGHT',
  'MEME_TEMPLATE',
  'STORY',
  'IMAGE_SLIDE',
  'UNDEFINED',
] as const;

const PatchSchema = z.object({
  format: z.enum(FORMATS).optional(),
  unlockFormat: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      { status: 400 }
    );
  }

  const data: { format?: (typeof FORMATS)[number]; formatLockedBy?: string | null } = {};
  if (parsed.data.format) {
    data.format = parsed.data.format;
    data.formatLockedBy = 'user';
  }
  if (parsed.data.unlockFormat) {
    data.formatLockedBy = 'auto';
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'no field to update' } },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.video.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        format: updated.format,
        formatLockedBy: updated.formatLockedBy,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: (e as Error).message } },
      { status: 404 }
    );
  }
}
