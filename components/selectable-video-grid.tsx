'use client';

import { useState, useRef, useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { VideoCard, type VideoCardData } from './video-card';
import { deleteVideosAction } from '@/app/actions/videos';
import { cn } from '@/lib/utils';

type DragRect = { x: number; y: number; w: number; h: number };

export function SelectableVideoGrid({
  videos,
  emptyState,
}: {
  videos: VideoCardData[];
  emptyState?: React.ReactNode;
}) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const initialSelectionRef = useRef<Set<string>>(new Set());

  const setCardRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) cardRefs.current.set(id, el);
      else cardRefs.current.delete(id);
    },
    []
  );

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setDragRect(null);
    dragStartRef.current = null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (!selectionMode) return;
    if (!containerRef.current) return;
    // 좌클릭만
    if (e.button !== 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragStartRef.current = {
      x: e.clientX - rect.left + containerRef.current.scrollLeft,
      y: e.clientY - rect.top + containerRef.current.scrollTop,
    };
    initialSelectionRef.current = new Set(selectedIds);
    setDragRect({ x: dragStartRef.current.x, y: dragStartRef.current.y, w: 0, h: 0 });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragStartRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cur = {
      x: e.clientX - rect.left + containerRef.current.scrollLeft,
      y: e.clientY - rect.top + containerRef.current.scrollTop,
    };
    const start = dragStartRef.current;
    const dx = cur.x - start.x;
    const dy = cur.y - start.y;
    const newRect = {
      x: dx >= 0 ? start.x : cur.x,
      y: dy >= 0 ? start.y : cur.y,
      w: Math.abs(dx),
      h: Math.abs(dy),
    };
    setDragRect(newRect);

    // 교차하는 카드 selectedIds 갱신 (initial + intersect)
    const containerRectAbs = containerRef.current.getBoundingClientRect();
    const next = new Set(initialSelectionRef.current);
    for (const [id, el] of cardRefs.current.entries()) {
      const c = el.getBoundingClientRect();
      const cx = c.left - containerRectAbs.left + containerRef.current.scrollLeft;
      const cy = c.top - containerRectAbs.top + containerRef.current.scrollTop;
      const cw = c.width;
      const ch = c.height;
      const intersects =
        cx < newRect.x + newRect.w &&
        cx + cw > newRect.x &&
        cy < newRect.y + newRect.h &&
        cy + ch > newRect.y;
      if (intersects) {
        // 토글 방식: 이미 initial에 있으면 빼고, 없으면 추가
        if (initialSelectionRef.current.has(id)) next.delete(id);
        else next.add(id);
      }
    }
    setSelectedIds(next);
  };

  const onMouseUp = () => {
    dragStartRef.current = null;
    setDragRect(null);
  };

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCardClick = (id: string, e: React.MouseEvent) => {
    if (selectionMode) {
      e.preventDefault();
      e.stopPropagation();
      toggleId(id);
    }
  };

  const onDeleteSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length}개 영상을 삭제할까요?`)) return;
    startTransition(async () => {
      const r = await deleteVideosAction(ids);
      if (r.ok) {
        exitSelection();
        router.refresh();
      } else {
        alert('삭제 실패: ' + r.error);
      }
    });
  };

  // ESC로 선택 모드 종료
  useEffect(() => {
    if (!selectionMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionMode]);

  if (videos.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        {!selectionMode ? (
          <button
            onClick={() => setSelectionMode(true)}
            className="rounded-md border bg-card px-3 py-1.5 text-[12.5px] hover:border-foreground/40"
          >
            🗑 선택 모드
          </button>
        ) : (
          <>
            <span className="rounded-md bg-foreground px-3 py-1.5 text-[12.5px] font-semibold text-background">
              {selectedIds.size}개 선택됨
            </span>
            <button
              onClick={onDeleteSelected}
              disabled={selectedIds.size === 0 || isPending}
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[12.5px] text-destructive hover:bg-destructive/20 disabled:opacity-40"
            >
              {isPending ? '삭제 중…' : `🗑 삭제 (${selectedIds.size})`}
            </button>
            <button
              onClick={exitSelection}
              className="rounded-md border bg-card px-3 py-1.5 text-[12.5px] hover:border-foreground/40"
            >
              ✕ 취소
            </button>
            <span className="ml-2 text-[11.5px] text-muted-foreground">
              빈 곳을 드래그해서 영역 선택, 카드 클릭으로 개별 토글, ESC로 종료
            </span>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        className={cn(
          'relative grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
          selectionMode && 'select-none'
        )}
      >
        {videos.map((v) => {
          const selected = selectedIds.has(v.id);
          return (
            <div
              key={v.id}
              ref={setCardRef(v.id)}
              onClick={(e) => onCardClick(v.id, e)}
              className={cn(
                'relative transition',
                selectionMode && 'cursor-pointer',
                selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background rounded-xl'
              )}
            >
              <VideoCard data={v} />
              {selectionMode && (
                <span
                  className={cn(
                    'pointer-events-none absolute -left-1.5 -top-1.5 z-20 grid h-6 w-6 place-items-center rounded-full border-2 text-[12px] font-black shadow',
                    selected
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-foreground/40 bg-background/90 text-foreground/40'
                  )}
                >
                  {selected ? '✓' : ''}
                </span>
              )}
            </div>
          );
        })}

        {dragRect && (
          <div
            className="pointer-events-none absolute z-30 border-2 border-foreground/60 bg-foreground/10"
            style={{
              left: dragRect.x,
              top: dragRect.y,
              width: dragRect.w,
              height: dragRect.h,
            }}
          />
        )}
      </div>
    </>
  );
}
