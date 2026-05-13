import { prisma } from '@/lib/db';
import { ChannelsClient } from './channels-client';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const [channels, folders] = await Promise.all([
    safeChannels(),
    safeFolders(),
  ]);

  return (
    <div className="px-4 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">에셋 채널</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          플랫폼별 탭에서 추가. 폴더(카테고리)는 같이 묶어 관리.
        </p>
      </div>

      <ChannelsClient channels={channels} folders={folders} />
    </div>
  );
}

async function safeChannels() {
  try {
    const rows = await prisma.channel.findMany({
      where: { isActive: true },
      include: { folder: { select: { name: true } } },
      orderBy: { addedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      platform: r.platform as 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN',
      externalId: r.externalId,
      handle: r.handle,
      displayName: r.displayName,
      folder: r.folder.name,
      folderId: r.folderId,
      subscriberCount: r.subscriberCount,
      lastScrapedAt: r.lastScrapedAt,
    }));
  } catch {
    return [];
  }
}

async function safeFolders() {
  try {
    // Prisma startsWith가 LIKE '__%'로 풀려 모든 행을 매치하므로 JS 필터 사용
    const folders = await prisma.folder.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
    return folders.filter((f) => !f.name.startsWith('__'));
  } catch {
    return [];
  }
}
