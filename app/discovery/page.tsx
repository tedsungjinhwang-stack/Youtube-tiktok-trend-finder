import { prisma } from '@/lib/db';
import { DiscoveryClient, type DiscoveryRow } from './discovery-client';

export const dynamic = 'force-dynamic';

function isMissingTable(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /relation .* does not exist|P2021|does not exist/i.test(msg);
}

export default async function DiscoveryPage() {
  let rows: DiscoveryRow[] = [];
  let warning: string | null = null;

  try {
    // 최근 24시간 수집분만 (cron 이 매시간 갱신 → 떨어진 글은 자연 소멸)
    const since = new Date(Date.now() - 24 * 3600_000);
    const posts = await prisma.discoveryPost.findMany({
      where: { collectedAt: { gte: since } },
      orderBy: [{ rank: 'asc' }],
      take: 600,
    });
    rows = posts.map((p) => ({
      id: p.id,
      tab: p.tab as DiscoveryRow['tab'],
      country: p.country,
      source: p.source,
      sourceLabel: p.sourceLabel,
      rank: p.rank,
      title: p.title,
      url: p.url,
      thumbnailUrl: p.thumbnailUrl,
      commentCount: p.commentCount,
      score: p.score,
      lang: p.lang,
      collectedAt: p.collectedAt.toISOString(),
    }));
  } catch (e) {
    if (isMissingTable(e)) {
      warning =
        'DB 마이그레이션 미실행: DiscoveryPost 테이블이 없습니다. Supabase SQL Editor 에서 마이그레이션 SQL 을 실행하세요.';
    } else {
      warning = `조회 실패: ${(e as Error).message.slice(0, 160)}`;
    }
  }

  return <DiscoveryClient rows={rows} warning={warning} />;
}
