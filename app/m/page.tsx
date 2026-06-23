import { prisma } from '@/lib/db';
import { MobileFeedClient, type FeedRow } from './mobile-client';

export const dynamic = 'force-dynamic';

function isMissingTable(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /relation .* does not exist|P2021|does not exist/i.test(msg);
}

export default async function MobileFeedPage() {
  let rows: FeedRow[] = [];
  let warning: string | null = null;
  let lastRunAt: string | null = null;

  try {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const posts = await prisma.discoveryPost.findMany({
      where: { collectedAt: { gte: since } },
      orderBy: [{ rank: 'asc' }],
      take: 600,
    });
    rows = posts.map((p) => ({
      id: p.id,
      tab: p.tab as FeedRow['tab'],
      country: p.country,
      source: p.source,
      sourceLabel: p.sourceLabel,
      rank: p.rank,
      prevRank: p.prevRank,
      title: p.title,
      url: p.url,
      thumbnailUrl: p.thumbnailUrl,
      commentCount: p.commentCount,
      prevCommentCount: p.prevCommentCount,
      viewCount: p.viewCount,
      prevViewCount: p.prevViewCount,
      score: p.score,
      prevScore: p.prevScore,
      lang: p.lang,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      firstSeenAt: p.firstSeenAt.toISOString(),
    }));
    const latest = await prisma.discoveryPost.aggregate({
      _max: { collectedAt: true },
    });
    lastRunAt = latest._max.collectedAt?.toISOString() ?? null;
  } catch (e) {
    if (isMissingTable(e)) {
      warning =
        'DB 마이그레이션 미실행: DiscoveryPost. Supabase SQL Editor 에서 SQL 실행.';
    } else {
      warning = `조회 실패: ${(e as Error).message.slice(0, 160)}`;
    }
  }

  return <MobileFeedClient rows={rows} warning={warning} lastRunAt={lastRunAt} />;
}
