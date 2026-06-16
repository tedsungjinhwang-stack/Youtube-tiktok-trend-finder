import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'channel-attachments';

type Ctx = { params: Promise<{ id: string }> };

function getStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** publicUrl 에서 버킷 이후 path 추출 — DELETE 시 storage object 키 필요 */
function pathFromPublicUrl(publicUrl: string): string | null {
  const m = publicUrl.match(/\/object\/public\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return m[2];
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: { label?: string | null } = {};
  if ('label' in body) data.label = body.label?.trim() || null;
  try {
    const updated = await prisma.channelAttachment.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const row = await prisma.channelAttachment.findUnique({ where: { id } });
    if (row) {
      const storage = getStorage();
      if (storage) {
        const objectPath = pathFromPublicUrl(row.url);
        if (objectPath) {
          await storage.storage.from(BUCKET).remove([objectPath]).catch(() => {});
        }
      }
      await prisma.channelAttachment.delete({ where: { id } });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
