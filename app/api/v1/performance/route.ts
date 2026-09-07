import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fetchChannelPerformance, type PerfChannel } from '@/lib/google/youtube';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

type Row = {
  id: string;
  name: string;
  category: string | null;
  profile: string | null;
  url: string | null;
  connected: boolean;
  perf: PerfChannel | null;
  error: string | null;
};

/**
 * 유튜브로 연결된 내 채널들의 최근 업로드 + 조회수.
 *
 * 채널 하나가 실패해도 나머지는 돌려준다 — 토큰 하나 만료됐다고 화면 전체가
 * 비면 어디가 문제인지 알 수 없다.
 */
export async function GET() {
  try {
    const channels = await prisma.myChannel.findMany({
      where: { isActive: true, platform: 'YOUTUBE' },
      select: {
        id: true,
        name: true,
        category: true,
        profile: true,
        url: true,
        youtubeOauth: { select: { id: true } },
      },
      orderBy: { name: 'asc' },
    });

    const rows: Row[] = await Promise.all(
      channels.map(async (c) => {
        const base = {
          id: c.id,
          name: c.name,
          category: c.category,
          profile: c.profile,
          url: c.url,
        };
        if (!c.youtubeOauth) {
          return { ...base, connected: false, perf: null, error: null };
        }
        try {
          return {
            ...base,
            connected: true,
            perf: await fetchChannelPerformance(c.youtubeOauth.id),
            error: null,
          };
        } catch (e) {
          return { ...base, connected: true, perf: null, error: (e as Error).message };
        }
      })
    );

    return NextResponse.json({ success: true, data: rows }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'LOAD_FAILED', message: (e as Error).message } },
      { status: 500, headers: NO_STORE }
    );
  }
}
