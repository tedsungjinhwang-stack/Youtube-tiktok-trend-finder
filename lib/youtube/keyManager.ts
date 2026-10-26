import { prisma } from '@/lib/db';
import { getCredSync } from '@/lib/credentials';

export class NoActiveKeyError extends Error {
  constructor() {
    super('ALL_KEYS_EXHAUSTED');
    this.name = 'NoActiveKeyError';
  }
}

/** 유튜브 할당량 날짜 (미국 서부 시간 기준 YYYY-MM-DD) — 이 날짜가 바뀌면 할당량이 새로 찬다 */
function ptDay(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d);
}

/**
 * 날짜가 바뀌면(미국 서부 자정 = KST 16~17시) 모든 키의 사용량을 0 으로, 소진 표시가 풀릴 시간이 지난 키는 다시 쓸 수 있게.
 * 마지막 사용 시각으로 판단하면, 같은 키를 다른 프로그램이 계속 쓰는 동안엔 날이 바뀌어도 0 이 안 돼서
 * 사용량이 며칠씩 쌓였다 — 그래서 날짜 표시(TrendCache)로 하루 한 번 초기화한다.
 */
let lastResetCheck = 0;

export async function resetStaleQuotas() {
  // 키를 쓸 때마다 부르니 1분에 한 번만 확인
  if (Date.now() - lastResetCheck < 60_000) return;
  lastResetCheck = Date.now();
  const day = ptDay();
  try {
    const mark = await prisma.trendCache.findUnique({ where: { key: 'yt:quota-day' } });
    if ((mark?.payload as { day?: string } | null)?.day !== day) {
      await prisma.youtubeApiKey.updateMany({ data: { usedToday: 0 } });
      await prisma.trendCache.upsert({
        where: { key: 'yt:quota-day' },
        create: { key: 'yt:quota-day', payload: { day } },
        update: { payload: { day }, fetchedAt: new Date() },
      });
    }
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
  // 미국 서부 날짜가 바뀌는 첫 정시 (서머타임이면 UTC 07시, 아니면 08시)
  const now = new Date();
  const today = ptDay(now);
  const t = new Date(now);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 26; i++) {
    t.setUTCHours(t.getUTCHours() + 1);
    if (ptDay(t) !== today) return t;
  }
  return new Date(now.getTime() + 24 * 3_600_000);
}
