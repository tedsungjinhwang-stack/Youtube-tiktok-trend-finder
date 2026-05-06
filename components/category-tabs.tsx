'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const FOLDERS = [
  { slug: 'all', label: '전체' },
  { slug: 'youngdrama', label: '영드짜' },
  { slug: 'foreign', label: '해외 영드짜' },
  { slug: 'variety', label: '예능짜집기' },
  { slug: 'igtt', label: '인스타 틱톡 짜집기' },
  { slug: 'trivia', label: '잡학상식' },
  { slug: 'kookpong', label: '국뽕' },
  { slug: 'blackbox', label: '블랙박스' },
  { slug: 'animal', label: '해짜 (동물)' },
  { slug: 'info', label: '해짜 | 정보' },
  { slug: 'lol', label: '게임 | 롤' },
  { slug: 'whale', label: '고래' },
  { slug: 'idol', label: '아이돌 팬튜브' },
  { slug: 'emotion', label: '감동' },
  { slug: 'corp', label: '대기업' },
  { slug: 'sports', label: '스포츠 | 커뮤' },
  { slug: 'baby', label: '아기' },
  { slug: 'anime', label: '애니 | 짤형' },
  { slug: 'food', label: '요리' },
  { slug: 'comm', label: '커뮤형' },
];

export function CategoryTabs({ active = 'all' }: { active?: string }) {
  const [current, setCurrent] = useState(active);

  return (
    <div className="sticky top-14 z-20 -mx-px border-b bg-background/90 backdrop-blur">
      <div className="flex gap-1 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FOLDERS.map((f) => (
          <button
            key={f.slug}
            onClick={() => setCurrent(f.slug)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition',
              current === f.slug
                ? 'bg-foreground text-background'
                : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
        <Link
          href="/folders"
          className="shrink-0 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-[12.5px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          + 폴더 관리
        </Link>
      </div>
    </div>
  );
}
