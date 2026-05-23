import { prisma } from '@/lib/db';
import type { Platform } from '@prisma/client';

export type FolderWithCount = {
  id: string;
  name: string;
  channelCount: number;
};

/**
 * 폴더 목록 + 활성 채널 수.
 * platforms를 넘기면 해당 플랫폼 채널만 카운트.
 * 시스템 폴더(__로 시작)는 제외.
 */
export async function getFoldersWithChannelCount(
  platforms?: Platform[]
): Promise<FolderWithCount[]> {
  try {
    const folders = await prisma.folder.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        channels: {
          where: {
            isActive: true,
            ...(platforms && platforms.length > 0
              ? { platform: { in: platforms } }
              : {}),
          },
          select: { id: true },
        },
      },
    });
    return folders
      .filter((f) => !f.name.startsWith('__'))
      .map((f) => ({
        id: f.id,
        name: f.name,
        channelCount: f.channels.length,
      }));
  } catch {
    return [];
  }
}
