'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Platform = 'TIKTOK' | 'INSTAGRAM';

type Hashtag = {
  id: string;
  platform: Platform;
  tag: string;
  folder: string | null;
  isActive: boolean;
  createdAt: string;
};

const FOLDER_SEED = [
  '영드짜', '해외 영드짜', '예능짜집기', '인스타 틱톡 짜집기', '잡학상식',
  '국뽕', '블랙박스', '해짜 (동물)', '해짜 | 정보', '게임 | 롤',
  '고래', '아이돌 팬튜브', '감동', '대기업', '스포츠 | 커뮤',
  '아기', '애니 | 짤형', '요리', '커뮤형',
];

export function HashtagManager({
  selectedIds,
  onSelectionChange,
}: {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const [items, setItems] = useState<Hashtag[]>([]);
  const [platform, setPlatform] = useState<Platform>('TIKTOK');
  const [tag, setTag] = useState('');
  const [folder, setFolder] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const r = await fetch('/api/v1/hashtags');
    const j = await r.json();
    setItems(j.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    setError(null);
    if (!tag.trim()) return;
    const r = await fetch('/api/v1/hashtags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform,
        tag,
        folder: folder || null,
      }),
    });
    const j = await r.json();
    if (!j.success) {
      setError(j.error?.message ?? '추가 실패');
      return;
    }
    setTag('');
    await refresh();
  };

  const remove = async (id: string) => {
    await fetch(`/api/v1/hashtags/${id}`, { method: 'DELETE' });
    onSelectionChange(selectedIds.filter((x) => x !== id));
    await refresh();
  };

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const grouped = groupByPlatform(items);

  return (
    <div className="mb-4 rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-semibold">해시태그 관리</div>
          <div className="mt-0.5 text-[10.5px] text-muted-foreground">
            태그를 클릭해서 켜고/끄기. 전체 끄면 모든 인기피드 표시.
          </div>
        </div>
        <span className="num text-[10.5px] text-muted-foreground">
          {items.length}개 등록 · {selectedIds.length}개 필터 중
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_180px_80px]">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          className="rounded-md border bg-background/40 px-2 py-2 text-[12.5px] outline-none focus:border-foreground/40"
        >
          <option value="TIKTOK">TikTok</option>
          <option value="INSTAGRAM">Instagram</option>
        </select>
        <input
          type="text"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          placeholder="해시태그 입력 (예: #영드짜 또는 영드짜)"
          className="rounded-md border bg-background/40 px-3 py-2 text-[12.5px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40"
        />
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          className="rounded-md border bg-background/40 px-2 py-2 text-[12.5px] outline-none focus:border-foreground/40"
        >
          <option value="">폴더 없음</option>
          {FOLDER_SEED.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={!tag.trim()}
          className={cn(
            'rounded-md px-3 py-2 text-[12.5px] font-semibold',
            tag.trim()
              ? 'bg-brand text-brand-foreground hover:bg-brand/90'
              : 'bg-secondary text-muted-foreground'
          )}
        >
          추가
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-3 text-center text-[11.5px] text-muted-foreground">
          불러오는 중…
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {(['TIKTOK', 'INSTAGRAM'] as Platform[]).map((p) => {
            const list = grouped[p] ?? [];
            return (
              <div key={p}>
                <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  <PlatformDot p={p} />
                  {p === 'TIKTOK' ? 'TikTok' : 'Instagram'}
                  <span className="num text-muted-foreground/60">
                    ({list.length})
                  </span>
                </div>
                {list.length === 0 ? (
                  <div className="rounded border border-dashed border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground/70">
                    등록된 해시태그 없음
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((h) => {
                      const selected = selectedIds.includes(h.id);
                      return (
                        <span
                          key={h.id}
                          className={cn(
                            'group inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11.5px] transition',
                            selected
                              ? 'border-brand bg-brand/15 text-brand'
                              : 'border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                          )}
                        >
                          <button onClick={() => toggle(h.id)}>
                            #{h.tag}
                            {h.folder && (
                              <span className="ml-1 text-[9.5px] opacity-70">
                                · {h.folder}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => remove(h.id)}
                            className="ml-0.5 rounded-full px-1 text-muted-foreground/70 opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                            title="삭제"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function groupByPlatform(items: Hashtag[]): Record<Platform, Hashtag[]> {
  const out: Record<Platform, Hashtag[]> = { TIKTOK: [], INSTAGRAM: [] };
  for (const h of items) out[h.platform].push(h);
  return out;
}

function PlatformDot({ p }: { p: Platform }) {
  const color = p === 'TIKTOK' ? 'bg-zinc-100' : 'bg-pink-500';
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />;
}
