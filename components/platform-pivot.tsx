'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';

const ALL_PLATFORMS: Platform[] = [
  'YOUTUBE',
  'TIKTOK',
  'INSTAGRAM',
  'XIAOHONGSHU',
  'DOUYIN',
];

const GROUPS: { key: string; label: string; platforms: Platform[] }[] = [
  { key: 'all', label: '통합', platforms: ALL_PLATFORMS },
  { key: 'youtube', label: 'YouTube', platforms: ['YOUTUBE'] },
  { key: 'social', label: 'TikTok / Insta', platforms: ['TIKTOK', 'INSTAGRAM'] },
  { key: 'xiaohongshu', label: '샤오홍수', platforms: ['XIAOHONGSHU'] },
  { key: 'douyin', label: '도우인', platforms: ['DOUYIN'] },
];

function detectGroup(currentSet: Set<Platform>): string {
  for (const g of GROUPS) {
    if (
      g.platforms.length === currentSet.size &&
      g.platforms.every((p) => currentSet.has(p))
    )
      return g.key;
  }
  return 'custom';
}

export function PlatformPivot({ platforms }: { platforms: Platform[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = new Set(platforms);
  const active = detectGroup(current);

  const pick = useCallback(
    (group: (typeof GROUPS)[number]) => {
      const params = new URLSearchParams(searchParams);
      params.set('platforms', group.platforms.join(','));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card/40 p-1.5">
      {GROUPS.map((g) => (
        <button
          key={g.key}
          onClick={() => pick(g)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-[13px] font-semibold transition',
            active === g.key
              ? 'bg-foreground text-background shadow-sm'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
