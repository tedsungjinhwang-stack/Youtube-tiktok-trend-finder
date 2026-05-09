import { prisma } from '@/lib/db';
import { FOLDER_SEED } from './seed-list';
import { FoldersToolbar } from './folders-toolbar';
import { FolderRow } from './folder-row';

export const dynamic = 'force-dynamic';

type FolderRowData = {
  id: string;
  name: string;
  channelCount: number;
  isSeed: boolean;
};

async function loadFolders(): Promise<FolderRowData[]> {
  try {
    // Prisma의 startsWith는 LIKE 와일드카드를 이스케이프하지 않아 '__'가
    // 'any 2 chars'로 해석돼 모든 행이 매치됨 → JS 단계에서 필터.
    const rows = await prisma.folder.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { channels: true } } },
    });
    return rows
      .filter((f) => !f.name.startsWith('__'))
      .map((f) => ({
        id: f.id,
        name: f.name,
        channelCount: f._count.channels,
        isSeed: false,
      }));
  } catch {
    return FOLDER_SEED.map((name, i) => ({
      id: `seed-${i}`,
      name,
      channelCount: 0,
      isSeed: true,
    }));
  }
}

export default async function FoldersPage() {
  const folders = await loadFolders();

  return (
    <div className="px-4 py-5">
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight">폴더 관리</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          이름·정렬·삭제.
        </p>
      </div>

      <FoldersToolbar />

      <div className="overflow-hidden rounded-xl border bg-card">
        {folders.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            폴더가 없습니다. 위의 + 새 폴더로 추가하세요.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {folders.map((f, i) => (
              <FolderRow
                key={f.id}
                id={f.id}
                name={f.name}
                channelCount={f.channelCount}
                index={i}
                isSeed={f.isSeed}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
