'use client';

import { useEffect, useState } from 'react';
import { cn, formatKr, formatRevenueRange } from '@/lib/utils';

type TrendingItem = {
  rank: number;
  videoId: string;
  url: string;
  title: string;
  thumbnailUrl: string;
  channelId: string;
  channelName: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number | null;
  durationSeconds: number;
  isShorts: boolean;
  region: string;
};

const COUNTRIES: { code: string; label: string }[] = [
  { code: 'KR', label: '한국' },
  { code: 'US', label: '미국' },
  { code: 'JP', label: '일본' },
  { code: 'GB', label: '영국' },
  { code: 'DE', label: '독일' },
  { code: 'FR', label: '프랑스' },
  { code: 'IN', label: '인도' },
  { code: 'BR', label: '브라질' },
];

type FormatTab = 'all' | 'long' | 'short';

const FORMATS: { code: FormatTab; label: string }[] = [
  { code: 'all', label: '전체' },
  { code: 'long', label: '롱폼' },
  { code: 'short', label: '쇼츠' },
];

export default function TrendingPage() {
  const [country, setCountry] = useState('KR');
  const [type, setType] = useState<FormatTab>('all');
  const [items, setItems] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    setKeyMissing(false);
    try {
      const r = await fetch(`/api/v1/youtube/trending?country=${country}&type=${type}&pages=2`);
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
  }, [country, type]);

  return (
    <div className="px-4 py-4 md:px-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">실시간 인기 급상승</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            지금 가장 뜨거운 유튜브 영상을 실시간으로 확인하세요
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-md border bg-card px-3 py-1.5 text-[13px] hover:border-foreground/40 disabled:opacity-60"
        >
          {loading ? '불러오는 중…' : '↻ 새로고침'}
        </button>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="mr-1 text-[11.5px] uppercase tracking-wider text-muted-foreground/80">
          국가
        </span>
        {COUNTRIES.map((c) => (
          <button
            key={c.code}
            onClick={() => setCountry(c.code)}
            className={cn(
              'rounded-full px-3 py-1',
              country === c.code
                ? 'bg-foreground text-background'
                : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px]">
        <span className="mr-1 text-[11.5px] uppercase tracking-wider text-muted-foreground/80">
          형식
        </span>
        {FORMATS.map((f) => (
          <button
            key={f.code}
            onClick={() => setType(f.code)}
            className={cn(
              'rounded-full px-3 py-1',
              type === f.code
                ? 'bg-foreground text-background'
                : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
            )}
          >
            {f.label}
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
            에서 YouTube Data API 키를 등록하세요.
          </p>
        </div>
      )}

      {error && !keyMissing && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13.5px] text-destructive">
          {error}
        </div>
      )}

      {!loading && items.length === 0 && !keyMissing && !error && (
        <div className="rounded-xl border border-dashed py-12 text-center text-[13.5px] text-muted-foreground">
          결과 없음.
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="hidden grid-cols-12 gap-4 border-b border-border/60 bg-secondary/40 px-5 py-2.5 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground/80 md:grid">
            <div className="col-span-1">순위</div>
            <div className="col-span-5">영상</div>
            <div className="col-span-3">채널</div>
            <div
              className="col-span-2 text-right"
              title="예상수익 RPM 기준 — 쇼츠 0.15~0.20원, 롱폼(8분↑) 2.0~2.3원"
            >
              조회수 / 예상수익
            </div>
            <div className="col-span-1 text-right">링크</div>
          </div>
          <ul className="divide-y divide-border/60">
            {items.map((v) => (
              <li key={v.videoId}>
                <TrendingRow v={v} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TrendingRow({ v }: { v: TrendingItem }) {
  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-3 transition hover:bg-secondary/30 md:grid-cols-12 md:gap-4 md:px-5 md:py-3.5">
      <div className="hidden items-center md:col-span-1 md:flex">
        <span className="num text-base font-bold text-muted-foreground">{v.rank}</span>
      </div>

      <div className="flex gap-3 md:col-span-5">
        <a
          href={v.url}
          target="_blank"
          rel="noreferrer"
          className={cn(
            'group relative shrink-0 overflow-hidden rounded-md bg-secondary',
            v.isShorts ? 'aspect-[9/16] w-16' : 'aspect-video w-32'
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={v.thumbnailUrl}
            alt=""
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
              }
            }}
            className="h-full w-full object-cover transition group-hover:scale-[1.03]"
          />
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10.5px] font-bold text-white backdrop-blur md:hidden">
            #{v.rank}
          </span>
          {v.isShorts && (
            <span className="absolute right-1 top-1 rounded bg-red-500/90 px-1 py-0.5 text-[9.5px] font-bold text-white backdrop-blur">
              SHORTS
            </span>
          )}
        </a>
        <div className="min-w-0 flex-1 self-center">
          <a
            href={v.url}
            target="_blank"
            rel="noreferrer"
            className="line-clamp-2 text-[13.5px] font-semibold leading-snug hover:underline"
          >
            {v.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground md:hidden">
            <span className="truncate">{v.channelName}</span>
            <span>·</span>
            <span className="num">{formatKr(v.viewCount)}회</span>
            <span>·</span>
            <span className="num">{formatRelative(v.publishedAt)}</span>
          </div>
          <div
            className="num mt-0.5 text-[11.5px] text-emerald-500/90 md:hidden"
            title={v.isShorts ? '한국 쇼츠 평균 RPM 0.15~0.20원 기준 추정' : '롱폼(8분↑) 평균 RPM 2.0~2.3원 기준 추정'}
          >
            예상수익 {formatRevenueRange(v.viewCount, { durationSeconds: v.durationSeconds, isShorts: v.isShorts })}
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 items-center md:col-span-3 md:flex">
        <a
          href={v.channelId ? `https://www.youtube.com/channel/${v.channelId}` : '#'}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-2 text-[13px] hover:underline"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{v.channelName}</div>
            <div className="num text-[11.5px] text-muted-foreground/80">
              {formatRelative(v.publishedAt)}
            </div>
          </div>
        </a>
      </div>

      <div className="hidden items-center justify-end md:col-span-2 md:flex">
        <div className="text-right">
          <div className="num text-[15px] font-bold leading-tight">{formatKr(v.viewCount)}</div>
          <div className="text-[10.5px] leading-tight text-muted-foreground/80">조회수</div>
          <div
            className="num mt-1 text-[12px] font-semibold leading-tight text-emerald-500/90"
            title={v.isShorts ? '한국 쇼츠 평균 RPM 0.15~0.20원 기준 추정' : '롱폼(8분↑) 평균 RPM 2.0~2.3원 기준 추정'}
          >
            {formatRevenueRange(v.viewCount, { durationSeconds: v.durationSeconds, isShorts: v.isShorts })}
          </div>
          <div className="text-[10.5px] leading-tight text-muted-foreground/80">예상수익</div>
        </div>
      </div>

      <div className="hidden items-center justify-end md:col-span-1 md:flex">
        <a
          href={v.url}
          target="_blank"
          rel="noreferrer"
          aria-label="외부 링크"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function formatRelative(d: string): string {
  if (!d) return '';
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
