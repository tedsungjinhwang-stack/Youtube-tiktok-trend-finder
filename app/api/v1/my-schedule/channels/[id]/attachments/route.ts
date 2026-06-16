import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel: 라우트 본문 최대 ~4.5MB. 큰 파일은 거부됨.
export const maxDuration = 30;

const MAX_PER_CHANNEL = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB
const BUCKET = 'channel-attachments';

type Ctx = { params: Promise<{ id: string }> };

function getStorage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;

  const storage = getStorage();
  if (!storage) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'STORAGE_NOT_CONFIGURED',
          message:
            'Supabase Storage 가 설정되지 않았습니다 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
        },
      },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'multipart/form-data 필요' } },
      { status: 400 }
    );
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { code: 'NO_FILE', message: '파일 누락' } },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'EMPTY_FILE', message: '빈 파일' } },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: `파일 너무 큼 (${(file.size / 1024 / 1024).toFixed(1)}MB). 최대 4MB.`,
        },
      },
      { status: 400 }
    );
  }

  try {
    const count = await prisma.channelAttachment.count({ where: { channelId: id } });
    if (count >= MAX_PER_CHANNEL) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'LIMIT_REACHED',
            message: `채널당 최대 ${MAX_PER_CHANNEL}개 — 기존 첨부를 삭제하고 다시 업로드하세요.`,
          },
        },
        { status: 400 }
      );
    }

    // 업로드 — 경로: <channelId>/<timestamp>-<filename>
    const safeName = file.name.replace(/[^\w.\-가-힣]/g, '_').slice(0, 120);
    const objectPath = `${id}/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const up = await storage.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (up.error) {
      // 버킷이 없을 수도 — 안내
      const msg = up.error.message || '업로드 실패';
      const hint = /not.*found|bucket/i.test(msg)
        ? `Supabase Storage 대시보드에서 public 버킷 "${BUCKET}" 을 먼저 만들어주세요.`
        : '';
      return NextResponse.json(
        { success: false, error: { code: 'UPLOAD_FAILED', message: `${msg}${hint ? ' — ' + hint : ''}` } },
        { status: 500 }
      );
    }

    const { data: pub } = storage.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub.publicUrl;

    const created = await prisma.channelAttachment.create({
      data: { channelId: id, url: publicUrl, label: file.name },
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
