import { prisma } from '@/lib/db';
import { ShareClient } from './share-client';

export const dynamic = 'force-dynamic';

export default async function UnifiedSharePage() {
  const [folders, myChannels, assetChannels] = await Promise.all([
    safeFolders(),
    safeMyChannels(),
    safeAssetChannels(),
  ]);
  return (
    <ShareClient
      folders={folders}
      myChannels={myChannels}
      assetChannels={assetChannels}
    />
  );
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
