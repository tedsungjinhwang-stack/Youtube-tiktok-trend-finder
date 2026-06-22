import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { scrapeAll } from '@/lib/discovery/scrapers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 디스커버리 수동 수집. 로그인된 브라우저(쿠키) 또는 Bearer 키로 인증.
 * /api/cron/discovery 와 로직 동일 — sourceKey upsert + 3일 정리.
 */
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED' } },
      { status: 401 }
    );
  }

  try {
    const { items, report } = await scrapeAll();
    const now = new Date();

    let saved = 0;
    for (const it of items) {
      await prisma.discoveryPost.upsert({
        where: { sourceKey: it.sourceKey },
        create: {
          tab: it.tab,
          country: it.country,
          source: it.source,
          sourceLabel: it.sourceLabel ?? null,
          sourceKey: it.sourceKey,
          rank: it.rank,
          title: it.title,
          url: it.url,
          thumbnailUrl: it.thumbnailUrl ?? null,
          commentCount: it.commentCount ?? null,
          score: it.score ?? null,
          lang: it.lang ?? null,
          publishedAt: it.publishedAt ?? null,
          collectedAt: now,
        },
        update: {
          rank: it.rank,
          title: it.title,
          sourceLabel: it.sourceLabel ?? null,
          thumbnailUrl: it.thumbnailUrl ?? null,
          commentCount: it.commentCount ?? null,
          score: it.score ?? null,
          collectedAt: now,
        },
      });
      saved += 1;
    }

    const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
    const pruned = await prisma.discoveryPost.deleteMany({
      where: { collectedAt: { lt: threeDaysAgo } },
    });

    return NextResponse.json({
      success: true,
      data: { saved, pruned: pruned.count, report, collectedAt: now },
    });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    return NextResponse.json(
      { success: false, error: { code: 'RUN_FAILED', message: msg } },
      { status: 500 }
    );
  }
}
