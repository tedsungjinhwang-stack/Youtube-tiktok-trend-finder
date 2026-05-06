import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scrapeChannel } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }

  try {
    const channel = await prisma.channel.findUnique({ where: { id: params.id } });
    if (!channel) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '채널 없음' } },
        { status: 404 }
      );
    }

    const result = await scrapeChannel(channel);
    return NextResponse.json({
      success: true,
      data: {
        channelId: channel.id,
        videosScraped: result.videos.length,
        quotaUsed: result.quotaUsed,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'SCRAPE_FAILED', message: (e as Error).message },
      },
      { status: 500 }
    );
  }
}
