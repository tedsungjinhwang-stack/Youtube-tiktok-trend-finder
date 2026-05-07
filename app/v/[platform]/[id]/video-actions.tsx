'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteVideoAction } from '@/app/actions/videos';

export function VideoActions({
  videoId,
  url,
}: {
  videoId: string;
  url: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard 실패 — 무시 */
    }
  };

  const onDelete = () => {
    if (!confirm('이 영상을 DB에서 삭제할까요?')) return;
    startTransition(async () => {
      const r = await deleteVideoAction(videoId);
      if (r.ok) router.push('/');
      else alert('삭제 실패: ' + r.error);
    });
  };

  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      <button
        onClick={onCopy}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[13.5px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      >
        <span className="text-[14px]">⎘</span>
        {copied ? '복사됨' : 'URL 복사'}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[13.5px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      >
        <span className="text-[14px]">↗</span>
        원본 영상
      </a>
      <button
        onClick={onDelete}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[13.5px] text-destructive hover:bg-destructive/20 disabled:opacity-50"
      >
        <span className="text-[14px]">✕</span>
        {isPending ? '삭제 중…' : '영상 삭제'}
      </button>
    </div>
  );
}
