/**
 * Credential resolver: DB → memory → env.
 *
 * - DB available  → write-through to prisma.credential, hydrated into memory on first read.
 * - DB unavailable → memory-only (lost on restart) + env fallback.
 *
 * Used by lib/auth.ts (OPENCLAW_API_KEY, CRON_SECRET) and lib/scraper/* (APIFY_API_TOKEN).
 */

import { prisma } from '@/lib/db';

export type CredService =
  | 'APIFY_API_TOKEN'
  | 'OPENCLAW_API_KEY'
  | 'CRON_SECRET'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'DATABASE_URL';

export const CRED_META: Record<
  CredService,
  { label: string; description: string; editable: boolean; bootOnly?: boolean }
> = {
  APIFY_API_TOKEN: {
    label: 'Apify',
    description: 'TikTok / Instagram 스크래핑',
    editable: true,
  },
  OPENCLAW_API_KEY: {
    label: 'OpenClaw',
    description: '외부 에이전트가 /api/v1/* 호출 시 Bearer 인증',
    editable: true,
  },
  CRON_SECRET: {
    label: 'Vercel Cron',
    description: '/api/cron/* 호출 인증',
    editable: true,
  },
  NEXT_PUBLIC_SUPABASE_URL: {
    label: 'Supabase URL',
    description: '클라이언트 번들에 포함되어야 해서 env 전용',
    editable: false,
    bootOnly: true,
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    label: 'Supabase Service Role',
    description: '서버 부팅 시점에 필요해서 env 전용',
    editable: false,
    bootOnly: true,
  },
  DATABASE_URL: {
    description: 'Prisma가 부팅 시 읽음 — 자기 참조 불가',
    label: 'Postgres',
    editable: false,
    bootOnly: true,
  },
};

const memoryStore = new Map<CredService, string>();
let hydrationDone = false;
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

async function hydrateOnce(): Promise<void> {
  if (hydrationDone) return;
  hydrationDone = true;
  if (!(await checkDb())) return;
  try {
    const rows = await prisma.credential.findMany();
    for (const r of rows) {
      memoryStore.set(r.service as CredService, r.value);
    }
  } catch {
    /* table not migrated yet */
  }
}

export async function getCred(service: CredService): Promise<string | null> {
  await hydrateOnce();
  return getCredSync(service);
}

/**
 * Sync resolver — reads hydrated memory + env. Hot-path auth checks use this.
 * If DB has a fresher value than memory, next async getCred() will refresh.
 */
export function getCredSync(service: CredService): string | null {
  if (memoryStore.has(service)) return memoryStore.get(service)!;
  return process.env[service] ?? null;
}

export async function setCred(service: CredService, value: string): Promise<void> {
  if (!CRED_META[service].editable) {
    throw new Error(`${service} is env-only (boot-time secret).`);
  }
  memoryStore.set(service, value);
  if (await checkDb()) {
    try {
      await prisma.credential.upsert({
        where: { service },
        create: { service, value },
        update: { value },
      });
    } catch {
      /* table not migrated yet — memory only */
    }
  }
}

export async function clearCred(service: CredService): Promise<void> {
  if (!CRED_META[service].editable) {
    throw new Error(`${service} is env-only (boot-time secret).`);
  }
  memoryStore.delete(service);
  if (await checkDb()) {
    try {
      await prisma.credential.delete({ where: { service } });
    } catch {
      /* not present or table missing */
    }
  }
}

export type CredStatus = {
  service: CredService;
  label: string;
  description: string;
  editable: boolean;
  bootOnly: boolean;
  isSet: boolean;
  source: 'db' | 'memory' | 'env' | 'none';
  preview: string | null;
};

export async function listCredStatus(): Promise<CredStatus[]> {
  await hydrateOnce();
  const dbServices = new Set<string>();
  if (await checkDb()) {
    try {
      const rows = await prisma.credential.findMany({ select: { service: true } });
      for (const r of rows) dbServices.add(r.service);
    } catch {
      /* table not migrated */
    }
  }

  const services = Object.keys(CRED_META) as CredService[];
  return services.map((s) => {
    const meta = CRED_META[s];
    const memVal = memoryStore.get(s);
    const envVal = process.env[s];
    const value = memVal ?? envVal ?? null;
    const source: CredStatus['source'] = dbServices.has(s)
      ? 'db'
      : memVal != null
        ? 'memory'
        : envVal != null
          ? 'env'
          : 'none';
    return {
      service: s,
      label: meta.label,
      description: meta.description,
      editable: meta.editable,
      bootOnly: meta.bootOnly ?? false,
      isSet: value != null,
      source,
      preview: maskCred(value),
    };
  });
}

export function maskCred(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return '***';
  return `${v.slice(0, 4)}***${v.slice(-4)}`;
}
