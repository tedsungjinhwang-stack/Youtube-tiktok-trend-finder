import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_PER_CHANNEL = 10;

type Ctx = { params: Promise<{ id: string }> };

/**
 * 단축 URL 도메인 패턴 — 매치되면 리다이렉트 따라가서 실주소로 변환.
 * (긴 URL 은 그대로 두면 fetch 비용 없이 빠르게 저장)
 */
const SHORT_URL_HOSTS = [
  /(^|\.)vm\.tiktok\.com$/i,
  /(^|\.)vt\.tiktok\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)xhslink\.com$/i,
  /(^|\.)v\.douyin\.com$/i,
  /(^|\.)iesdouyin\.com$/i,
  /(^|\.)instagr\.am$/i,
  /(^|\.)t\.co$/i,
  /(^|\.)bit\.ly$/i,
];

function isShortUrl(u: string): boolean {
  try {
    const host = new URL(u).hostname;
    return SHORT_URL_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

/** 단축 URL 을 실제 도착지 URL 로 해석 (최대 10초). 실패 시 원본 반환. */
async function resolveFinalUrl(url: string): Promise<string> {
  if (!isShortUrl(url)) return url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    // HEAD 가 모바일 short URL 에서 막히는 경우가 많아 GET 으로 따라감.
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        // 일부 서비스는 봇으로 보면 200/리다이렉트 안 함 — 모바일 UA 흉내.
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    });
    return r.url || url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();
  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() || null : null;
  if (!rawUrl) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_URL', message: 'URL을 입력해주세요.' } },
      { status: 400 }
    );
  }

  // 단축 URL 이면 실주소로 변환
  const url = await resolveFinalUrl(rawUrl);

  try {
    const created = await prisma.$transaction(async (tx) => {
      // 채널당 최대 N개 유지 — 추가 후 N개 초과면 오래된 것부터 삭제 (FIFO)
      const newRow = await tx.channelMaterial.create({
        data: { channelId: id, url, note },
      });
      const all = await tx.channelMaterial.findMany({
        where: { channelId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const excess = all.length - MAX_PER_CHANNEL;
      if (excess > 0) {
        await tx.channelMaterial.deleteMany({
          where: { id: { in: all.slice(0, excess).map((m) => m.id) } },
        });
      }
      return newRow;
    });
    return NextResponse.json({ success: true, data: created });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
