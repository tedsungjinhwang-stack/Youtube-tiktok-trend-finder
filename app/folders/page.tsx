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
    const rows = await prisma.folder.findMany({
      where: { NOT: { name: { startsWith: '__' } } },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { channels: true } } },
    });
    return rows.map((f) => ({
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
          이름·정렬·삭제. 시드 19개 다시 불러오기 가능.
        </p>
      </div>

      <FoldersToolbar />

      <div className="overflow-hidden rounded-xl border bg-card">
        {folders.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-muted-foreground">
            폴더가 없습니다. 시드 다시 불러오기로 19개를 생성하세요.
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
