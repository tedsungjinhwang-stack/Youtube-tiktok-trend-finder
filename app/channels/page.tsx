import { prisma } from '@/lib/db';
import { ChannelsClient, type SummaryRow } from './channels-client';

export const dynamic = 'force-dynamic';

/**
 * 에셋 채널. 채널이 수만 개(pint 채널팩)라 처음엔 폴더별 개수만 불러오고,
 * 폴더를 펼칠 때 그 폴더 채널만 가져온다.
 */
export default async function ChannelsPage() {
  const [summary, folders] = await Promise.all([safeSummary(), safeFolders()]);

  return (
    <div className="px-4 py-5">
      <div className="mb-4">
        <h1 className="text-lg font-bold tracking-tight">에셋 채널</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          플랫폼별 탭에서 추가. 폴더(카테고리)는 같이 묶어 관리. pint 채널팩은 요청하면 한 번씩 갱신합니다 (90일 넘게 업로드 없는 채널은 꺼 둠).
        </p>
      </div>

      <ChannelsClient summary={summary} folders={folders} />
    </div>
  );
}

async function safeSummary(): Promise<SummaryRow[]> {
  try {
    const [groups, folders] = await Promise.all([
      prisma.channel.groupBy({
        by: ['platform', 'folderId', 'kind'],
        where: { isActive: true },
        _count: { _all: true },
      }),
      prisma.folder.findMany({ select: { id: true, name: true, sortOrder: true } }),
    ]);
    const byId = new Map(folders.map((f) => [f.id, f]));
    return groups
      .filter((g) => !byId.get(g.folderId)?.name.startsWith('__'))
      .map((g) => ({
        platform: g.platform as SummaryRow['platform'],
        folderId: g.folderId,
        folder: byId.get(g.folderId)?.name ?? '(폴더 없음)',
        sortOrder: byId.get(g.folderId)?.sortOrder ?? 999,
        kind: (g.kind === 'SOURCE' ? 'SOURCE' : 'REFERENCE') as SummaryRow['kind'],
        count: g._count._all,
      }));
  } catch {
    return [];
  }
}

async function safeFolders() {
  try {
    // Prisma startsWith가 LIKE '__%'로 풀려 모든 행을 매치하므로 JS 필터 사용
    const folders = await prisma.folder.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    });
    return folders.filter((f) => !f.name.startsWith('__'));
  } catch {
    return [];
  }
}
