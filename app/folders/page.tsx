import { prisma } from '@/lib/db';
import { FOLDER_SEED } from './seed-list';
import { FoldersToolbar } from './folders-toolbar';

export const dynamic = 'force-dynamic';

type FolderRow = { id: string; name: string; channelCount: number };

async function loadFolders(): Promise<FolderRow[]> {
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
    }));
  } catch {
    return FOLDER_SEED.map((name, i) => ({
      id: `seed-${i}`,
      name,
      channelCount: 0,
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
              <li
                key={f.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40"
              >
                <span className="num w-6 text-[12.5px] tabular-nums text-muted-foreground">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-muted-foreground/40">⋮⋮</span>
                <span className="flex-1 text-[14.5px] font-medium">{f.name}</span>
                <span className="num text-[12.5px] text-muted-foreground">
                  ({f.channelCount})
                </span>
                <button className="rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  이름 변경
                </button>
                <button className="rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
