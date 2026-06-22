import { prisma } from '@/lib/db';
import { scrapeAll, type DiscoveryItem } from './scrapers';

/**
 * 스크랩 + DB 저장 공통 로직.
 * - 직전 값을 prevRank/prevCommentCount/prevScore 에 복사 → 화면에서 변화량 표시 가능
 * - sourceKey 단일 unique key 기반 update / create
 * - 3일 지난 항목 자동 정리
 */
export async function collectAndSave(): Promise<{
  saved: number;
  pruned: number;
  report: Record<string, number | string>;
  collectedAt: Date;
}> {
  const { items, report } = await scrapeAll();
  const now = new Date();

  // 기존 행을 한 번에 가져와서 prev 값을 채우기 위한 룩업
  const existing = await prisma.discoveryPost.findMany({
    where: { sourceKey: { in: items.map((i) => i.sourceKey) } },
    select: { sourceKey: true, rank: true, commentCount: true, score: true },
  });
  const prevMap = new Map(existing.map((e) => [e.sourceKey, e]));

  // 병렬로 처리 (Prisma 풀이 알아서 조절)
  await Promise.all(items.map((it) => writeOne(it, prevMap.get(it.sourceKey), now)));

  // 3일 넘은 항목 정리
  const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
  const pruned = await prisma.discoveryPost.deleteMany({
    where: { collectedAt: { lt: threeDaysAgo } },
  });

  return { saved: items.length, pruned: pruned.count, report, collectedAt: now };
}

async function writeOne(
  it: DiscoveryItem,
  prev: { rank: number; commentCount: number | null; score: number | null } | undefined,
  now: Date
) {
  if (prev) {
    await prisma.discoveryPost.update({
      where: { sourceKey: it.sourceKey },
      data: {
        prevRank: prev.rank,
        prevCommentCount: prev.commentCount,
        prevScore: prev.score,
        rank: it.rank,
        title: it.title,
        sourceLabel: it.sourceLabel ?? null,
        thumbnailUrl: it.thumbnailUrl ?? null,
        commentCount: it.commentCount ?? null,
        score: it.score ?? null,
        collectedAt: now,
      },
    });
  } else {
    await prisma.discoveryPost.create({
      data: {
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
        firstSeenAt: now,
        collectedAt: now,
      },
    });
  }
}
