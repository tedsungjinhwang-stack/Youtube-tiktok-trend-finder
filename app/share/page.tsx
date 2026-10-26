import { prisma } from '@/lib/db';
import { ShareClient } from './share-client';

export const dynamic = 'force-dynamic';

export default async function UnifiedSharePage() {
  // 에셋 채널은 수만 개라 여기서 다 싣지 않고, 폴더를 고를 때 그 폴더 것만 불러온다
  const [folders, myChannels] = await Promise.all([safeFolders(), safeMyChannels()]);
  return <ShareClient folders={folders} myChannels={myChannels} />;
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
