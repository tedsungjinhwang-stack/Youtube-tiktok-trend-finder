/**
 * Credential resolver: DB → in-memory override → env.
 *
 * Phase 1 (now): in-memory Map only. Survives until server restart.
 * Phase 2 (DB connected): swap memoryStore checks to prisma.credential.findUnique.
 *
 * Used by lib/auth.ts (OPENCLAW_API_KEY, CRON_SECRET) and lib/scraper/* (APIFY_API_TOKEN).
 */

export type CredService =
  | 'APIFY_API_TOKEN'
  | 'OPENCLAW_API_KEY'
  | 'CRON_SECRET'
  | 'NEXT_PUBLIC_SUPABASE_URL'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'DATABASE_URL';

/** Which services are editable from the UI vs env-only (boot-time secrets). */
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

/**
 * Resolve a credential value. Returns null if not set anywhere.
 * Async because Phase 2 will call DB.
 */
export async function getCred(service: CredService): Promise<string | null> {
  // Phase 2: try DB first
  // const row = await prisma.credential.findUnique({ where: { service } });
  // if (row) return row.value;
  return getCredSync(service);
}

/**
 * Sync resolver for hot-path auth checks (memory → env, no DB).
 * Phase 2: keep as cache, refreshed by background job that reads DB.
 */
export function getCredSync(service: CredService): string | null {
  if (memoryStore.has(service)) return memoryStore.get(service)!;
  return process.env[service] ?? null;
}

/** Set or update a credential. Phase 2: prisma.credential.upsert. */
export async function setCred(service: CredService, value: string): Promise<void> {
  if (!CRED_META[service].editable) {
    throw new Error(`${service} is env-only (boot-time secret).`);
  }
  // Phase 2: await prisma.credential.upsert(...)
  memoryStore.set(service, value);
}

/** Clear in-memory override; falls back to env again. */
export async function clearCred(service: CredService): Promise<void> {
  if (!CRED_META[service].editable) {
    throw new Error(`${service} is env-only (boot-time secret).`);
  }
  // Phase 2: await prisma.credential.delete({ where: { service } })
  memoryStore.delete(service);
}

export type CredStatus = {
  service: CredService;
  label: string;
  description: string;
  editable: boolean;
  bootOnly: boolean;
  isSet: boolean;
  source: 'memory' | 'env' | 'none';
  preview: string | null;
};

export async function listCredStatus(): Promise<CredStatus[]> {
  const services = Object.keys(CRED_META) as CredService[];
  return Promise.all(
    services.map(async (s) => {
      const meta = CRED_META[s];
      const memVal = memoryStore.get(s);
      const envVal = process.env[s];
      const value = memVal ?? envVal ?? null;
      const source = memVal != null ? 'memory' : envVal != null ? 'env' : 'none';
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
    })
  );
}

export function maskCred(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return '***';
  return `${v.slice(0, 4)}***${v.slice(-4)}`;
}
