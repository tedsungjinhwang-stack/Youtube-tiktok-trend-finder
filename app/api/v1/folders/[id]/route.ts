import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  sortOrder: z.number().int().optional(),
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
  return NextResponse.json({
    success: true,
    data: { id: params.id, ...parsed.data },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }
  const moveTo = req.nextUrl.searchParams.get('moveTo');
  return NextResponse.json({
    success: true,
    data: { id: params.id, deleted: true, movedChannelsTo: moveTo },
  });
}
