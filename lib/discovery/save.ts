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
  const { items: raw, report } = await scrapeAll();
  const now = new Date();

  // 같은 sourceKey 중복 제거 (스크래퍼가 동일 글을 두 번 뱉는 케이스 대비 — 가장 높은 순위 유지)
  const dedup = new Map<string, DiscoveryItem>();
  for (const it of raw) {
    const prev = dedup.get(it.sourceKey);
    if (!prev || it.rank < prev.rank) dedup.set(it.sourceKey, it);
  }
  const items = [...dedup.values()];

  // 기존 행을 한 번에 가져와서 prev 값을 채우기 위한 룩업
  const existing = await prisma.discoveryPost.findMany({
    where: { sourceKey: { in: items.map((i) => i.sourceKey) } },
    select: { sourceKey: true, rank: true, commentCount: true, score: true },
  });
  const prevMap = new Map(existing.map((e) => [e.sourceKey, e]));

  // 8개씩 배치 처리 — Supabase pgbouncer 풀 고갈/타임아웃 방지.
  // 항목별 에러는 흡수해서 한두 개 깨져도 나머지는 계속 진행.
  const CHUNK = 8;
  let writeErrors = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const slice = items.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((it) =>
        writeOne(it, prevMap.get(it.sourceKey), now).catch(() => {
          writeErrors += 1;
        })
      )
    );
  }
  if (writeErrors > 0) report.writeErrors = writeErrors;

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
    return;
  }
  try {
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
  } catch (e) {
    // P2002 = unique violation. 이미 존재 → update 로 폴백
    const code = (e as { code?: string })?.code;
    if (code !== 'P2002') throw e;
    await prisma.discoveryPost.update({
      where: { sourceKey: it.sourceKey },
      data: {
        rank: it.rank,
        title: it.title,
        sourceLabel: it.sourceLabel ?? null,
        thumbnailUrl: it.thumbnailUrl ?? null,
        commentCount: it.commentCount ?? null,
        score: it.score ?? null,
        collectedAt: now,
      },
    });
  }
}
