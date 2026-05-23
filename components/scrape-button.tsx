'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { scrapePlatformsAction } from '@/app/actions/scrape';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';

export function ScrapeButton({
  platforms,
  label,
}: {
  platforms: Platform[];
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folderId') ?? undefined;

  const click = () => {
    setMsg(null);
    start(async () => {
      const r = await scrapePlatformsAction(platforms, folderId);
      if (r.ok) {
        const scope = folderId && folderId !== 'all' ? '카테고리' : '전체';
        setMsg(
          r.dispatched === 0
            ? `${scope} 대상 채널 없음`
            : `완료 — ${scope} 채널 ${r.dispatched}개 (성공 ${r.ok_count} / 실패 ${r.failed})`
        );
        router.refresh();
        setTimeout(() => setMsg(null), 5000);
      } else {
        setMsg(r.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={click}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[13px] hover:border-foreground/40 disabled:opacity-50"
      >
        {pending && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
        {pending ? '조회 중…' : (label ?? '에셋 채널 조회')}
      </button>
      {msg && (
        <span className="text-[12px] text-muted-foreground">{msg}</span>
      )}
    </div>
  );
}
