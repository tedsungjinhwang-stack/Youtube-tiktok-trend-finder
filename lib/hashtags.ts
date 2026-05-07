/**
 * Hashtag store: DB if connected, in-memory fallback otherwise.
 */

import { prisma } from '@/lib/db';

export type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM';

export type Hashtag = {
  id: string;
  platform: Platform;
  tag: string;
  folder: string | null;
  isActive: boolean;
  createdAt: string;
};

const memoryStore = new Map<string, Hashtag>();
let dbAvailable: boolean | null = null;

async function checkDb(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}

let seeded = false;
function seedMemoryOnce() {
  if (seeded) return;
  seeded = true;
  const seeds: { platform: Platform; tag: string; folder: string | null }[] = [
    { platform: 'TIKTOK', tag: '국뽕', folder: '국뽕' },
    { platform: 'TIKTOK', tag: '영드짜', folder: '영드짜' },
    { platform: 'TIKTOK', tag: '롤', folder: '게임 | 롤' },
    { platform: 'INSTAGRAM', tag: '강아지', folder: '해짜 (동물)' },
    { platform: 'INSTAGRAM', tag: '예능', folder: '예능짜집기' },
    { platform: 'INSTAGRAM', tag: '아이돌', folder: '아이돌 팬튜브' },
  ];
  for (const s of seeds) {
    const tag = normalizeTag(s.tag);
    const row: Hashtag = {
      id: `seed_${s.platform}_${tag}`,
      platform: s.platform,
      tag,
      folder: s.folder,
      isActive: true,
      createdAt: new Date(0).toISOString(),
    };
    memoryStore.set(keyFor(s.platform, tag), row);
  }
}

export async function listHashtags(): Promise<Hashtag[]> {
  if (await checkDb()) {
    try {
      const rows = await prisma.hashtag.findMany({
        include: { folder: { select: { name: true } } },
        orderBy: [{ platform: 'asc' }, { tag: 'asc' }],
      });
      return rows.map((r) => ({
        id: r.id,
        platform: r.platform as Platform,
        tag: r.tag,
        folder: r.folder?.name ?? null,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
      }));
    } catch {
      /* table not migrated, fall through to memory */
    }
  }
  seedMemoryOnce();
  return Array.from(memoryStore.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    return a.tag.localeCompare(b.tag);
  });
}

export async function addHashtag(input: {
  platform: Platform;
  tag: string;
  folder?: string | null;
}): Promise<Hashtag> {
  const tag = normalizeTag(input.tag);
  if (!tag) throw new Error('빈 해시태그');

  if (await checkDb()) {
    try {
      const folderRow = input.folder
        ? await prisma.folder.findUnique({ where: { name: input.folder } })
        : null;
      const row = await prisma.hashtag.create({
        data: {
          platform: input.platform,
          tag,
          folderId: folderRow?.id ?? null,
        },
      });
      return {
        id: row.id,
        platform: row.platform as Platform,
        tag: row.tag,
        folder: input.folder ?? null,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (e: any) {
      if (e?.code === 'P2002') throw new Error('이미 등록된 해시태그');
      // table missing → fall through
    }
  }

  // memory path
  seedMemoryOnce();
  const key = keyFor(input.platform, tag);
  if (memoryStore.has(key)) throw new Error('이미 등록된 해시태그');
  const row: Hashtag = {
    id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    platform: input.platform,
    tag,
    folder: input.folder ?? null,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  memoryStore.set(key, row);
  return row;
}

export async function removeHashtag(id: string): Promise<boolean> {
  if (await checkDb()) {
    try {
      await prisma.hashtag.delete({ where: { id } });
      return true;
    } catch (e: any) {
      if (e?.code === 'P2025') return false;
      // table missing → fall through
    }
  }
  for (const [k, v] of memoryStore.entries()) {
    if (v.id === id) {
      memoryStore.delete(k);
      return true;
    }
  }
  return false;
}

export async function toggleHashtag(
  id: string,
  isActive: boolean
): Promise<Hashtag | null> {
  if (await checkDb()) {
    try {
      const row = await prisma.hashtag.update({
        where: { id },
        data: { isActive },
        include: { folder: { select: { name: true } } },
      });
      return {
        id: row.id,
        platform: row.platform as Platform,
        tag: row.tag,
        folder: row.folder?.name ?? null,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
      };
    } catch {
      // fall through
    }
  }
  for (const [, v] of memoryStore.entries()) {
    if (v.id === id) {
      v.isActive = isActive;
      return v;
    }
  }
  return null;
}

/** Active hashtags grouped by platform — for scraper input building. */
export async function getActiveHashtagsByPlatform(): Promise<{
  TIKTOK: string[];
  INSTAGRAM: string[];
}> {
  const all = await listHashtags();
  const out = { TIKTOK: [] as string[], INSTAGRAM: [] as string[] };
  for (const h of all) {
    if (h.isActive) out[h.platform].push(h.tag);
  }
  return out;
}

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, '').toLowerCase();
}

function keyFor(platform: Platform, tag: string): string {
  return `${platform}:${tag}`;
}
