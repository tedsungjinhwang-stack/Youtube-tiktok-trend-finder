import { prisma } from '@/lib/db';
import { PresetsClient } from './presets-client';

export const dynamic = 'force-dynamic';

function isMissingTable(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /relation .* does not exist|P2021|does not exist/i.test(msg);
}

export default async function PresetsPage() {
  let presets: Awaited<ReturnType<typeof prisma.scrapePreset.findMany>> = [];
  let warning: string | null = null;
  try {
    presets = await prisma.scrapePreset.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  } catch (e) {
    if (isMissingTable(e)) {
      warning =
        'DB 마이그레이션 미실행 (ScrapePreset). prisma/migrations/20260623000000_scrape_preset/migration.sql 실행 필요.';
    } else {
      warning = `로드 실패: ${(e as Error).message.slice(0, 200)}`;
    }
  }
  const folders = await prisma.folder
    .findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
    .catch(() => []);
  return (
    <PresetsClient
      initial={presets.map((p) => ({
        ...p,
        lastRunAt: p.lastRunAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }))}
      folders={folders}
      warning={warning}
    />
  );
}
