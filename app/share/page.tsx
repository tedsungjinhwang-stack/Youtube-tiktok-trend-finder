import { prisma } from '@/lib/db';
import { ShareClient } from './share-client';

export const dynamic = 'force-dynamic';

export default async function UnifiedSharePage() {
  const [folders, myChannels, assetChannels, community] = await Promise.all([
    safeFolders(),
    safeMyChannels(),
    safeAssetChannels(),
    safeCommunity(),
  ]);
  return (
    <ShareClient
      folders={folders}
      myChannels={myChannels}
      assetChannels={assetChannels}
      community={community.posts}
      communityLastRunAt={community.lastRunAt}
    />
  );
}

async function safeCommunity() {
  try {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const posts = await prisma.discoveryPost.findMany({
      where: { collectedAt: { gte: since } },
      orderBy: [{ rank: 'asc' }],
      take: 400,
    });
    const latest = await prisma.discoveryPost.aggregate({
      _max: { collectedAt: true },
    });
    return {
      posts: posts.map((p) => ({
        id: p.id,
        tab: p.tab,
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
      })),
      lastRunAt: latest._max.collectedAt?.toISOString() ?? null,
    };
  } catch {
    return { posts: [], lastRunAt: null };
  }
}

async function safeFolders() {
  try {
    const folders = await prisma.folder.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
    return folders.filter((f) => !f.name.startsWith('__'));
  } catch {
    return [];
  }
}

async function safeMyChannels() {
  try {
    const rows = await prisma.myChannel.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        category: true,
        materials: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, url: true, createdAt: true },
        },
      },
    });
    return rows.map((r) => ({
      ...r,
      materials: r.materials.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      })),
    }));
  } catch {
    return [];
  }
}

async function safeAssetChannels() {
  try {
    const rows = await prisma.channel.findMany({
      where: { isActive: true },
      include: { folder: { select: { id: true, name: true } } },
      orderBy: { addedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform as 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN',
      handle: r.handle,
      displayName: r.displayName,
      externalId: r.externalId,
      folderId: r.folderId,
      folderName: r.folder.name,
      kind: (r.kind ?? 'REFERENCE') as 'REFERENCE' | 'SOURCE',
    }));
  } catch {
    return [];
  }
}
