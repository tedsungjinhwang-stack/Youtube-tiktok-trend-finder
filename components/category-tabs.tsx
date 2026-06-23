'use client';

import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';
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
  const [expanded, setExpanded] = useState(false);

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

  const visible = folders.filter((f) => !f.name.startsWith('__'));
  const activeFolder = visible.find((f) => f.id === currentFolderId);
  const activeLabel = activeFolder?.name ?? '전체';
  const activeCount = activeFolder?.channelCount;

  return (
    <div className="sticky top-14 z-20 -mx-px border-b bg-background/95 backdrop-blur">
      <div className="px-4 py-2.5">
        {/* 헤더: 라벨 + 현재 선택 + 펼치기 / 폴더 관리 */}
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            카테고리
          </span>
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[13px] font-semibold">
            {activeLabel}
            {activeCount != null && activeCount > 0 && (
              <span className="num ml-1 text-[12px] text-muted-foreground">
                {activeCount}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto text-[13px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? '접기 ▲' : `전체 보기 ▼`}
          </button>
          <Link
            href="/folders"
            className="text-[13px] text-muted-foreground hover:text-foreground"
            title="폴더 관리"
          >
            ⚙
          </Link>
        </div>

        {/* 칩 영역 — 기본 1줄(가로 스크롤), 펼치면 여러 줄(wrap) */}
        <div
          className={cn(
            'flex gap-1.5',
            expanded
              ? 'flex-wrap'
              : 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          )}
        >
          <Tab
            label="전체"
            active={currentFolderId === 'all'}
            onClick={() => setFolder('all')}
          />
          {visible.map((f) => (
            <Tab
              key={f.id}
              label={f.name}
              count={f.channelCount}
              active={currentFolderId === f.id}
              onClick={() => setFolder(f.id)}
            />
          ))}
        </div>
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
        'shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition',
        active
          ? 'bg-foreground text-background shadow-sm'
          : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:bg-accent hover:text-foreground'
      )}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={cn(
            'num ml-1.5 text-[13px] tabular-nums',
            active ? 'text-background/70' : 'text-muted-foreground/70'
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
