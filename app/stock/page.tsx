import { prisma } from '@/lib/db';
import { StockClient } from './stock-client';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const folders = await safeFolders();
  return (
    <div className="px-4 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">소재 창고</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          폴더(카테고리)별로 URL · 제목 · 설명을 영구 보관 (자동 정리 X)
        </p>
      </div>
      <StockClient folders={folders} />
    </div>
  );
}

async function safeFolders() {
  try {
    const folders = await prisma.folder.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
    return folders.filter((f) => !f.name.startsWith('__'));
  } catch {
    return [];
  }
}
