import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' } as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const folderId = url.searchParams.get('folderId') || undefined;
  try {
    const items = await prisma.stockMaterial.findMany({
      where: folderId ? { folderId } : {},
      orderBy: { createdAt: 'desc' },
      include: { folder: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ success: true, data: items }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const folderId = String(body.folderId ?? '').trim();
  const rawUrl = String(body.url ?? '').trim();
  const title = String(body.title ?? '').trim() || null;
  const description = String(body.description ?? '').trim() || null;
  if (!folderId || !rawUrl) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: 'folderId 와 url 필수' } },
      { status: 400, headers: NO_STORE }
    );
  }
  try {
    const created = await prisma.stockMaterial.create({
      data: { folderId, url: rawUrl, title, description },
    });
    return NextResponse.json({ success: true, data: created }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500, headers: NO_STORE }
    );
  }
}
