'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

export type CategoryFolder = {
  id: string;
  name: string;
  channelCount?: number;
};

export function CategoryTabs({ folders }: { folders: CategoryFolder[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFolderId = searchParams.get('folderId') ?? 'all';

  const setFolder = useCallback(
    (folderId: string) => {
      const params = new URLSearchParams(searchParams);
      if (folderId === 'all') params.delete('folderId');
      else params.set('folderId', folderId);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="sticky top-14 z-20 -mx-px border-b bg-background/90 backdrop-blur">
      <div className="flex gap-1 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Tab
          label="전체"
          active={currentFolderId === 'all'}
          onClick={() => setFolder('all')}
        />
        {folders
          .filter((f) => !f.name.startsWith('__'))
          .map((f) => (
            <Tab
              key={f.id}
              label={f.name}
              count={f.channelCount}
              active={currentFolderId === f.id}
              onClick={() => setFolder(f.id)}
            />
          ))}
        <Link
          href="/folders"
          className="shrink-0 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-[13.5px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          + 폴더 관리
        </Link>
      </div>
    </div>
  );
}

function Tab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-[13.5px] font-medium transition',
        active
          ? 'bg-foreground text-background'
          : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
      )}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={cn(
            'num ml-1.5 text-[11.5px] tabular-nums',
            active ? 'text-background/70' : 'text-muted-foreground/70'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
