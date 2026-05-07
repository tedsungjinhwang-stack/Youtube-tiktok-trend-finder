'use client';

import { useEffect, useState } from 'react';
import { cn, formatKr } from '@/lib/utils';

type TrendingItem = {
  rank: number;
  videoId: string;
  url: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number | null;
  durationSeconds: number;
  isShorts: boolean;
  region: string;
};

const REGIONS: { code: string; label: string }[] = [
  { code: 'KR', label: '한국' },
  { code: 'US', label: '미국' },
  { code: 'JP', label: '일본' },
  { code: 'GB', label: '영국' },
  { code: 'DE', label: '독일' },
  { code: 'FR', label: '프랑스' },
  { code: 'IN', label: '인도' },
  { code: 'BR', label: '브라질' },
];

type FormatTab = 'all' | 'short' | 'long';

export default function TrendingPage() {
  const [region, setRegion] = useState('KR');
  const [format, setFormat] = useState<FormatTab>('all');
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setKeyMissing(false);
    try {
      const r = await fetch(`/api/v1/youtube/trending?region=${region}&pages=2`);
      const j = await r.json();
      if (!j.success) {
        if (j.error?.code === 'NO_KEY') setKeyMissing(true);
        else setError(j.error?.message ?? '오류');
        setItems([]);
      } else {
        setItems(j.data ?? []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [region]);

  const filtered = items.filter((v) =>
    format === 'all' ? true : format === 'short' ? v.isShorts : !v.isShorts
  );

  return (
    <div className="px-4 py-4">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">YouTube 실시간 인기 급상승</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            지역·형식별 인기 급상승 영상
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-md border bg-card px-3 py-1.5 text-[13.5px] hover:border-foreground/40"
        >
          {loading ? '불러오는 중…' : '↻ 새로고침'}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="text-[11.5px] uppercase tracking-wider text-muted-foreground/80 mr-1">
          지역
        </span>
        {REGIONS.map((r) => (
          <button
            key={r.code}
            onClick={() => setRegion(r.code)}
            className={cn(
              'rounded-full px-3 py-1',
              region === r.code
                ? 'bg-foreground text-background'
                : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="text-[11.5px] uppercase tracking-wider text-muted-foreground/80 mr-1">
          형식
        </span>
        {(['all', 'short', 'long'] as FormatTab[]).map((f) => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            className={cn(
              'rounded-full px-3 py-1',
              format === f
                ? 'bg-foreground text-background'
                : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {f === 'all' ? '전체' : f === 'short' ? '쇼츠' : '롱폼'}
          </button>
        ))}
      </div>

      {keyMissing && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-[13.5px]">
          <div className="font-semibold">YouTube API 키 없음</div>
          <p className="mt-1 text-muted-foreground">
            <a href="/settings/api-keys" className="text-brand underline">
              /settings/api-keys
            </a>{' '}
            에서 YouTube Data API 키를 등록하세요. 등록 후 새로고침하면 실시간
            데이터가 들어옵니다.
          </p>
        </div>
      )}

      {error && !keyMissing && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && !keyMissing && !error && (
        <div className="rounded-xl border border-dashed py-12 text-center text-[13.5px] text-muted-foreground">
          결과 없음.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((v) => (
            <TrendingCard key={v.videoId} v={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrendingCard({ v }: { v: TrendingItem }) {
  return (
    <a
      href={v.url}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-xl border border-border/60 bg-card transition hover:border-foreground/30"
    >
      <div className={`relative ${v.isShorts ? 'aspect-[9/16]' : 'aspect-video'} bg-secondary`}>
        {v.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={v.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : null}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[12px] font-bold backdrop-blur">
          #{v.rank}
        </span>
        {v.isShorts && (
          <span className="absolute right-2 top-2 rounded bg-red-500/90 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur">
            SHORTS
          </span>
        )}
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        <div className="line-clamp-2 text-[13.5px] font-semibold leading-snug">
          {v.title}
        </div>
        <div className="num truncate text-[12px] text-muted-foreground">
          {v.channelName}
        </div>
        <div className="flex items-baseline justify-between text-[12.5px]">
          <span className="text-muted-foreground/80">조회</span>
          <span className="num font-semibold">{formatKr(v.viewCount)}</span>
        </div>
        {v.publishedAt && (
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className="text-muted-foreground/80">업로드</span>
            <span className="num text-foreground/85">{formatRelative(v.publishedAt)}</span>
          </div>
        )}
        {v.likeCount != null && (
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className="text-muted-foreground/80">좋아요</span>
            <span className="num">{formatKr(v.likeCount)}</span>
          </div>
        )}
      </div>
    </a>
  );
}

function formatRelative(d: string): string {
  const date = new Date(d);
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(ms / 3_600_000);
  const day = Math.floor(ms / 86_400_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  if (day < 30) return `${day}일 전`;
  const kst = new Date(date.getTime() + 9 * 3600_000);
  const Y = String(kst.getUTCFullYear()).slice(2);
  const M = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const D = String(kst.getUTCDate()).padStart(2, '0');
  return `${Y}.${M}.${D}`;
}
