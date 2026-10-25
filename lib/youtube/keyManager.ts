import { prisma } from '@/lib/db';
import { getCredSync } from '@/lib/credentials';

export class NoActiveKeyError extends Error {
  constructor() {
    super('ALL_KEYS_EXHAUSTED');
    this.name = 'NoActiveKeyError';
  }
}

/**
 * 날짜가 바뀐(PT 자정 = KST 17시 지난) 키의 사용량을 0 으로, 소진 표시가 풀릴 시간이 지난 키는 다시 쓸 수 있게.
 * 예전엔 매일 외부 크론(reset-youtube-quotas)이 했는데, 크론이 빠져도 돌아가도록 쓸 때마다 확인한다.
 */
export async function resetStaleQuotas() {
  const lastReset = new Date(nextPTMidnight().getTime() - 86_400_000);
  try {
    await prisma.youtubeApiKey.updateMany({
      where: { usedToday: { gt: 0 }, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: lastReset } }] },
      data: { usedToday: 0 },
    });
    await prisma.youtubeApiKey.updateMany({
      where: { resetAt: { lt: new Date() } },
      data: { exhaustedAt: null, resetAt: null },
    });
  } catch {
    /* DB 없음 — 넘어간다 */
  }
}

/**
 * 가장 덜 쓴 활성 키. 할당량 초기화는 resetStaleQuotas 가 쓸 때마다 확인한다.
 * Falls back to env YOUTUBE_API_KEY when DB unavailable (single-key mode for dev).
 */
export async function getActiveKey() {
  await resetStaleQuotas();
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

/** 영구 비활성화 — API 키 만료/무효 등 quota 초과가 아닌 회복 불가능한 경우. */
export async function markDisabled(keyId: string, error?: string) {
  if (keyId === 'env') return null;
  try {
    return await prisma.youtubeApiKey.update({
      where: { id: keyId },
      data: {
        isActive: false,
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
