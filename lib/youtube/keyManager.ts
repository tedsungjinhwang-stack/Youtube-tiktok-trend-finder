import { prisma } from '@/lib/db';
import { getCredSync } from '@/lib/credentials';

export class NoActiveKeyError extends Error {
  constructor() {
    super('ALL_KEYS_EXHAUSTED');
    this.name = 'NoActiveKeyError';
  }
}

/**
 * Pick least-used active key. PT midnight (KST 17:00) cron resets quotas separately.
 * Falls back to env YOUTUBE_API_KEY when DB unavailable (single-key mode for dev).
 */
export async function getActiveKey() {
  try {
    const dbKey = await prisma.youtubeApiKey.findFirst({
      where: {
        isActive: true,
        OR: [{ exhaustedAt: null }, { resetAt: { lt: new Date() } }],
      },
      orderBy: { usedToday: 'asc' },
    });
    if (dbKey) return dbKey;
  } catch {
    /* DB not connected — try env fallback */
  }
  const fallbackKey = getCredSync('YOUTUBE_API_KEY');
  if (fallbackKey) {
    return {
      id: 'env',
      label: 'env',
      apiKey: fallbackKey,
      isActive: true,
      dailyQuotaLimit: 10000,
      usedToday: 0,
      lastUsedAt: null,
      exhaustedAt: null,
      resetAt: null,
      failCount: 0,
      lastError: null,
      createdAt: new Date(),
    };
  }
  return null;
}

export async function markUsed(keyId: string, units: number) {
  if (keyId === 'env') return null;
  try {
    return await prisma.youtubeApiKey.update({
      where: { id: keyId },
      data: {
        usedToday: { increment: units },
        lastUsedAt: new Date(),
      },
    });
  } catch {
    return null;
  }
}

export async function markExhausted(keyId: string, error?: string) {
  if (keyId === 'env') return null;
  try {
    return await prisma.youtubeApiKey.update({
      where: { id: keyId },
      data: {
        exhaustedAt: new Date(),
        resetAt: nextPTMidnight(),
        lastError: error,
        failCount: { increment: 1 },
      },
    });
  } catch {
    return null;
  }
}

export async function resetAllQuotas() {
  return prisma.youtubeApiKey.updateMany({
    data: {
      usedToday: 0,
      exhaustedAt: null,
      resetAt: null,
    },
  });
}

function nextPTMidnight(): Date {
  // PT midnight = UTC 08:00 (PDT) or 07:00 (PST). Use 08:00 as conservative.
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0, 0)
  );
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
