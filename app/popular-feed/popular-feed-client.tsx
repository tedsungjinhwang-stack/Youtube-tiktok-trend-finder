'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  addHashtagAction,
  removeHashtagAction,
  searchHashtagAction,
} from './actions';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM';

type Hashtag = {
  id: string;
  platform: Platform;
  tag: string;
  isActive: boolean;
};

export function PopularFeedClient({
  hashtags,
  activeTag,
}: {
  hashtags: Hashtag[];
  activeTag: string | null;
}) {
  const [tab, setTab] = useState<Platform>('YOUTUBE');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtered = hashtags.filter((h) => h.platform === tab);

  const setActiveTag = (tag: string | null, platform?: Platform) => {
    const params = new URLSearchParams(searchParams);
    if (tag) {
      params.set('hashtag', tag);
      // 클릭한 해시태그의 플랫폼만 보이게 자동 필터
      if (platform) params.set('platforms', platform);
    } else {
      params.delete('hashtag');
      params.delete('platforms');
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b">
        {(['YOUTUBE', 'TIKTOK', 'INSTAGRAM'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setTab(p)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[14px] transition',
              tab === p
                ? 'border-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {p === 'YOUTUBE' ? 'YouTube' : p === 'TIKTOK' ? 'TikTok' : 'Instagram'}
            <span className="num ml-1.5 text-[12px] text-muted-foreground">
              ({hashtags.filter((h) => h.platform === p).length})
            </span>
          </button>
        ))}
      </div>

      <AddForm platform={tab} />

      {activeTag && (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">필터:</span>
          <span className="rounded-full bg-foreground px-2 py-0.5 font-semibold text-background">
            #{activeTag}
          </span>
          <button
            onClick={() => setActiveTag(null)}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            ✕ 해제
          </button>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-muted-foreground">
            등록된 {tab === 'YOUTUBE' ? 'YouTube' : tab === 'TIKTOK' ? 'TikTok' : 'Instagram'} 해시태그 없음.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((h) => (
              <HashtagRow
                key={h.id}
                h={h}
                isActiveFilter={activeTag === h.tag}
                onSelect={() =>
                  setActiveTag(
                    activeTag === h.tag ? null : h.tag,
                    activeTag === h.tag ? undefined : h.platform
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type SearchPeriod = '24h' | '48h' | '7d' | '30d' | 'older_6m' | 'all';

function HashtagRow({
  h,
  isActiveFilter,
  onSelect,
}: {
  h: Hashtag;
  isActiveFilter: boolean;
  onSelect: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [period, setPeriod] = useState<SearchPeriod>('all');

  const onSearch = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await searchHashtagAction(h.tag, h.platform, period);
      if (!r.ok) setError(r.error);
      else
        setInfo(
          `+${r.data.saved}개 신규 (총 ${r.data.fetched}개 중 ${r.data.skipped}개 기존)`
        );
    });
  };

  const onDelete = () => {
    if (!confirm(`#${h.tag} 삭제할까요?`)) return;
    startTransition(async () => {
      const r = await removeHashtagAction(h.id);
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <li
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 text-[13.5px] transition',
        isActiveFilter && 'bg-foreground/10 border-l-2 border-foreground'
      )}
    >
      <button
        onClick={onSelect}
        className={cn(
          'flex-1 text-left font-medium hover:underline',
          isActiveFilter ? 'text-foreground' : 'text-foreground/90'
        )}
      >
        {isActiveFilter && '▶ '}#{h.tag}
      </button>
      {info && <span className="text-[11.5px] text-success">{info}</span>}
      {error && <span className="text-[11.5px] text-warning">{error}</span>}
      {h.platform === 'YOUTUBE' && (
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as SearchPeriod)}
          disabled={isPending}
          title="검색 기간 (YouTube만 적용)"
          className="rounded border border-border/60 bg-background/40 px-1.5 py-1 text-[11.5px] hover:border-foreground/40 disabled:opacity-40"
        >
          <option value="all">전체 (모든 기간)</option>
          <option value="24h">최근 24h</option>
          <option value="48h">최근 48h</option>
          <option value="7d">최근 7일</option>
          <option value="30d">최근 30일</option>
          <option value="older_6m">6개월 이상 된 영상</option>
        </select>
      )}
      <button
        onClick={onSearch}
        disabled={isPending}
        title="검색 실행"
        className="rounded border border-border/60 bg-background/40 px-2 py-1 text-[12px] hover:border-foreground/40 disabled:opacity-40"
      >
        {isPending ? '검색 중…' : '🔍 검색'}
      </button>
      <button
        onClick={onDelete}
        disabled={isPending}
        title="삭제"
        className="rounded p-1 text-[12px] text-muted-foreground hover:bg-warning/10 hover:text-warning disabled:opacity-40"
      >
        ✕
      </button>
    </li>
  );
}

function AddForm({ platform }: { platform: Platform }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (formData: FormData) => {
    setError(null);
    formData.set('platform', platform);
    startTransition(async () => {
      const r = await addHashtagAction(formData);
      if (!r.ok) setError(r.error);
      else {
        const form = document.getElementById(`add-hashtag-${platform}`) as HTMLFormElement | null;
        form?.reset();
      }
    });
  };

  return (
    <form
      id={`add-hashtag-${platform}`}
      action={onSubmit}
      className="flex gap-2 rounded-xl border bg-card p-3"
    >
      <input
        name="tag"
        type="text"
        placeholder={`#태그 입력 (예: movierecap)`}
        required
        disabled={isPending}
        className="flex-1 rounded-md border bg-background/40 px-3 py-2 text-[14px] outline-none placeholder:text-muted-foreground/60 focus:border-foreground/40 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-foreground px-3 py-2 text-[14px] font-semibold text-background hover:opacity-90 disabled:opacity-40"
      >
        {isPending ? '추가 중…' : '추가'}
      </button>
      {error && (
        <span className="self-center text-[12px] text-warning">{error}</span>
      )}
    </form>
  );
}
