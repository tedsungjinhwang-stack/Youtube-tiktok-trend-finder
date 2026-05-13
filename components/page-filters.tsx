'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';
type Period = '24h' | '48h' | '7d' | '30d' | 'all';
type SortBy = 'viralScore' | 'views' | 'publishedAt';
type Preset = 'hot' | 'revival';

/** 프리셋: 한 번 클릭으로 여러 URL 파라미터 동시 설정 */
const PRESETS: Record<
  Preset,
  { label: string; hint: string; params: Record<string, string | null> }
> = {
  hot: {
    label: '🔥 지금 뜨는',
    hint: '48시간 내 5만회 이상',
    params: {
      period: '48h',
      minViews: '50000',
      minAgeDays: null,
      sortBy: 'views',
    },
  },
  revival: {
    label: '💓 심정지',
    hint: '1달↑ 영상 100만회 이상',
    params: {
      minAgeDays: '30',
      minViews: '1000000',
      period: 'all',
      sortBy: 'views',
    },
  },
};

const PLATFORM_LABELS: Record<Platform, string> = {
  YOUTUBE: 'YT',
  TIKTOK: 'TT',
  INSTAGRAM: 'IG',
  XIAOHONGSHU: '샤오홍수',
  DOUYIN: '도우인',
};

const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '48h', label: '48h' },
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: 'all', label: '전체' },
];

const SORTS: { value: SortBy; label: string }[] = [
  { value: 'viralScore', label: '채널 평균 대비' },
  { value: 'views', label: '조회수' },
  { value: 'publishedAt', label: '최신' },
];

export function PageFilters({
  platforms = ['YOUTUBE', 'TIKTOK', 'INSTAGRAM'],
  showPlatformToggle = true,
  defaults,
}: {
  /** 이 페이지에서 토글 가능한 플랫폼 (예: /youtube는 [YOUTUBE]만) */
  platforms?: Platform[];
  showPlatformToggle?: boolean;
  /** 사용자 기본값 (쿠키에서 서버가 읽어 전달) */
  defaults: { minViews: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === '') params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const platformParam = searchParams.get('platforms');
  const activePlatforms = new Set<Platform>(
    platformParam ? (platformParam.split(',') as Platform[]) : platforms
  );

  const period = (searchParams.get('period') as Period) ?? 'all';
  const sortBy = (searchParams.get('sortBy') as SortBy) ?? 'views';

  const togglePlatform = (p: Platform) => {
    const next = new Set(activePlatforms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    if (next.size === 0 || next.size === platforms.length) {
      updateParams({ platforms: null });
    } else {
      updateParams({ platforms: Array.from(next).join(',') });
    }
  };

  const activePreset = detectActivePreset(searchParams);

  const applyPreset = (preset: Preset) => {
    if (activePreset === preset) {
      // 같은 걸 다시 누르면 해제 — 모든 프리셋 키 제거
      updateParams({
        period: null,
        minViews: null,
        minAgeDays: null,
        sortBy: null,
      });
    } else {
      updateParams(PRESETS[preset].params);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        {(Object.keys(PRESETS) as Preset[]).map((p) => (
          <PresetButton
            key={p}
            label={PRESETS[p].label}
            hint={PRESETS[p].hint}
            active={activePreset === p}
            onClick={() => applyPreset(p)}
          />
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        {PERIODS.map((p) => (
          <Pill
            key={p.value}
            label={p.label}
            active={period === p.value}
            onClick={() =>
              updateParams({ period: p.value === 'all' ? null : p.value })
            }
          />
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        {SORTS.map((s) => (
          <Pill
            key={s.value}
            label={s.label}
            active={sortBy === s.value}
            onClick={() =>
              updateParams({
                sortBy: s.value === 'views' ? null : s.value,
              })
            }
          />
        ))}

        {showPlatformToggle && platforms.length > 1 && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            {platforms.map((p) => (
              <Toggle
                key={p}
                label={PLATFORM_LABELS[p]}
                active={activePlatforms.has(p)}
                onClick={() => togglePlatform(p)}
              />
            ))}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-muted-foreground">
        <ThresholdInput
          label="최소 조회수"
          paramKey="minViews"
          defaultValue={defaults.minViews}
          step={10000}
          min={0}
          format={(n) => `${(n / 1000).toFixed(0)}K`}
          updateParams={updateParams}
          searchParams={searchParams}
        />
      </div>
    </div>
  );
}

function detectActivePreset(searchParams: URLSearchParams): Preset | null {
  for (const [key, def] of Object.entries(PRESETS) as [Preset, typeof PRESETS[Preset]][]) {
    const matches = Object.entries(def.params).every(([k, v]) => {
      const current = searchParams.get(k);
      return v == null ? current == null : current === v;
    });
    if (matches) return key;
  }
  return null;
}

function PresetButton({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className={cn(
        'rounded-full px-3 py-1 font-semibold transition',
        active
          ? 'bg-foreground text-background'
          : 'border border-border/60 bg-card text-foreground hover:border-foreground/40'
      )}
    >
      {label}
    </button>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 transition',
        active
          ? 'bg-foreground text-background'
          : 'border border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1 transition',
        active
          ? 'border-foreground/40 bg-foreground text-background'
          : 'border-border/60 bg-background/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

function ThresholdInput({
  label,
  paramKey,
  defaultValue,
  step,
  min,
  format,
  updateParams,
  searchParams,
}: {
  label: string;
  paramKey: string;
  defaultValue: number;
  step: number;
  min: number;
  format?: (n: number) => string;
  updateParams: (u: Record<string, string | null>) => void;
  searchParams: URLSearchParams;
}) {
  const raw = searchParams.get(paramKey);
  const value = raw != null ? Number(raw) : defaultValue;

  const setValue = (n: number) => {
    const clamped = Math.max(min, n);
    updateParams({
      [paramKey]: clamped === defaultValue ? null : String(clamped),
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <span>{label}</span>
      <button
        onClick={() => setValue(value - step)}
        className="grid h-5 w-5 place-items-center rounded border border-border/60 hover:border-foreground/40 hover:text-foreground"
      >
        −
      </button>
      <span className="num min-w-[3.5rem] text-center font-semibold tabular-nums text-foreground">
        {format ? format(value) : value}
      </span>
      <button
        onClick={() => setValue(value + step)}
        className="grid h-5 w-5 place-items-center rounded border border-border/60 hover:border-foreground/40 hover:text-foreground"
      >
        +
      </button>
    </div>
  );
}
