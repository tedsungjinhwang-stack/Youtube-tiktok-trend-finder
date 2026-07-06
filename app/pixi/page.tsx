import { prisma } from '@/lib/db';
import { PixiClient, type SavedTemplate } from './pixi-client';

export const dynamic = 'force-dynamic';

export default async function PixiPage() {
  let templates: SavedTemplate[] = [];
  let warning: string | null = null;
  try {
    const rows = await prisma.pixiTemplate.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    templates = rows.map((r) => ({
      id: r.id,
      name: r.name,
      style: r.style as SavedTemplate['style'],
    }));
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (/relation .* does not exist|P2021|does not exist/i.test(msg)) {
      warning =
        'DB 마이그레이션 미실행 (PixiTemplate). prisma/migrations/20260706000000_pixi_template/migration.sql 실행 필요.';
    } else {
      warning = `로드 실패: ${msg.slice(0, 160)}`;
    }
  }
  return <PixiClient initialTemplates={templates} warning={warning} />;
}
