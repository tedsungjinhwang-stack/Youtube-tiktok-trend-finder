import { prisma } from '@/lib/db';
import { ChannelShareClient } from './share-client';

export const dynamic = 'force-dynamic';

export default async function ChannelsSharePage() {
  const folders = await safeFolders();
  return <ChannelShareClient folders={folders} />;
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
