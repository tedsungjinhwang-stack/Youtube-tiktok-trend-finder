/**
 * Hashtag store — in-memory map for Phase 1, swap to Prisma in Phase 2.
 *
 * Used by /social 인기피드 mode and (future) lib/scraper/apify.ts hashtag input.
 */

export type Platform = 'TIKTOK' | 'INSTAGRAM';

export type Hashtag = {
  id: string;
  platform: Platform;
  tag: string; // without # prefix, lowercase
  folder: string | null;
  isActive: boolean;
  createdAt: string;
};

const store = new Map<string, Hashtag>();

// seed a couple so the page isn't empty on first load
seed();

export function listHashtags(): Hashtag[] {
  return Array.from(store.values()).sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    return a.tag.localeCompare(b.tag);
  });
}

export function addHashtag(input: {
  platform: Platform;
  tag: string;
  folder?: string | null;
}): Hashtag {
  const tag = normalizeTag(input.tag);
  if (!tag) throw new Error('빈 해시태그');
  const key = keyFor(input.platform, tag);
  if (store.has(key)) throw new Error('이미 등록된 해시태그');

  const row: Hashtag = {
    id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    platform: input.platform,
    tag,
    folder: input.folder ?? null,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  store.set(key, row);
  return row;
}

export function removeHashtag(id: string): boolean {
  for (const [k, v] of store.entries()) {
    if (v.id === id) {
      store.delete(k);
      return true;
    }
  }
  return false;
}

export function toggleHashtag(id: string, isActive: boolean): Hashtag | null {
  for (const [, v] of store.entries()) {
    if (v.id === id) {
      v.isActive = isActive;
      return v;
    }
  }
  return null;
}

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function keyFor(platform: Platform, tag: string): string {
  return `${platform}:${tag}`;
}

function seed() {
  if (store.size > 0) return;
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
    store.set(keyFor(s.platform, tag), row);
  }
}
