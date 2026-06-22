import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/auth';
import { getCredSync } from '@/lib/credentials';
import { prisma } from '@/lib/db';
import { scrapeAll } from '@/lib/discovery/scrapers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 디스커버리 수집 cron.
 *
 * Vercel Hobby 는 일 1회 cron 만 허용 → 외부 cron(cron-job.org)으로 매시간 호출.
 *   GET https://<도메인>/api/cron/discovery
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   (헤더 못 넣는 경우 ?secret=<CRON_SECRET> 쿼리도 허용)
 *
 * 동작: 4개 소스 수집 → sourceKey 기준 upsert(순위/댓글수/collectedAt 갱신)
 *      → 3일 지난 항목 삭제(DB 정리). 화면은 최근 수집분만 노출.
 */
export async function GET(req: NextRequest) {
  const qSecret = req.nextUrl.searchParams.get('secret');
  const expected = getCredSync('CRON_SECRET');
  const ok = checkCronAuth(req) || (!!expected && qSecret === expected);
  if (!ok) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'CRON_SECRET required' } },
      { status: 401 }
    );
  }

  try {
    const { items, report } = await scrapeAll();
    const now = new Date();

    let saved = 0;
    // 순차 upsert (소스 합쳐 ~150건, 60초 내 충분). sourceKey 유니크 기준.
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

    // 3일 넘은 항목 정리
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
      { success: false, error: { code: 'DISCOVERY_FAILED', message: msg } },
      { status: 500 }
    );
  }
}
