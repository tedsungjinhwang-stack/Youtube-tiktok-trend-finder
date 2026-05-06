import { prisma } from '@/lib/db';

export class NoActiveKeyError extends Error {
  constructor() {
    super('ALL_KEYS_EXHAUSTED');
    this.name = 'NoActiveKeyError';
  }
}

/**
 * Pick least-used active key. PT midnight (KST 17:00) cron resets quotas separately.
 */
export async function getActiveKey() {
  return prisma.youtubeApiKey.findFirst({
    where: {
      isActive: true,
      OR: [{ exhaustedAt: null }, { resetAt: { lt: new Date() } }],
    },
    orderBy: { usedToday: 'asc' },
  });
}

export async function markUsed(keyId: string, units: number) {
  return prisma.youtubeApiKey.update({
    where: { id: keyId },
    data: {
      usedToday: { increment: units },
      lastUsedAt: new Date(),
    },
  });
}

export async function markExhausted(keyId: string, error?: string) {
  return prisma.youtubeApiKey.update({
    where: { id: keyId },
    data: {
      exhaustedAt: new Date(),
      resetAt: nextPTMidnight(),
      lastError: error,
      failCount: { increment: 1 },
    },
  });
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
