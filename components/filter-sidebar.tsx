import { cn } from '@/lib/utils';

type ChipGroup = {
  title: string;
  options: { value: string; label: string }[];
  active: string;
};

const filterGroups: ChipGroup[] = [
  {
    title: '뷰',
    active: 'hot',
    options: [
      { value: 'hot', label: 'HOT 터진' },
      { value: 'new', label: 'NEW 최신' },
    ],
  },
  {
    title: '플랫폼',
    active: 'all',
    options: [
      { value: 'all', label: 'ALL' },
      { value: 'youtube', label: 'YouTube' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'instagram', label: 'Instagram' },
    ],
  },
  {
    title: '영상 형식',
    active: 'all',
    options: [
      { value: 'all', label: '전체' },
      { value: 'short', label: '숏폼' },
      { value: 'long', label: '롱폼' },
    ],
  },
  {
    title: '기간',
    active: '7d',
    options: [
      { value: '24h', label: '24h' },
      { value: '7d', label: '7일' },
      { value: '30d', label: '30일' },
      { value: 'all', label: '전체' },
    ],
  },
  {
    title: '정렬',
    active: 'score',
    options: [
      { value: 'score', label: 'viralScore' },
      { value: 'views', label: '조회수' },
      { value: 'date', label: '최신' },
    ],
  },
];

const folderSeed = [
  '영드짜', '해외 영드짜', '예능짜집기', '인스타 틱톡 짜집기', '잡학상식',
  '국뽕', '블랙박스', '해짜 (동물)', '해짜 | 정보', '게임 | 롤',
  '고래', '아이돌 팬튜브', '감동', '대기업', '스포츠 | 커뮤',
  '아기', '애니 | 짤형', '요리', '커뮤형',
];

export function FilterSidebar() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r bg-card/40 p-4 lg:block">
      {filterGroups.map((g) => (
        <ChipBlock key={g.title} group={g} />
      ))}

      <Block title="임계치">
        <div className="space-y-3 text-xs text-muted-foreground">
          <Slider label="minScore" value={3} max={10} />
          <Slider label="minViews" value={50} suffix="K" max={500} />
        </div>
      </Block>

      <Block title="기타">
        <Toggle label="대형채널 제외" />
        <Toggle label="Shorts만" />
      </Block>

      <Block title={`폴더 (${folderSeed.length})`}>
        <div className="flex flex-wrap gap-1">
          {folderSeed.map((name) => (
            <span
              key={name}
              className="cursor-pointer rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5 text-[12px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            >
              {name}
            </span>
          ))}
        </div>
      </Block>

      <button className="mt-4 w-full rounded-md border bg-background/40 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
        프리셋 저장
      </button>
    </aside>
  );
}

function ChipBlock({ group }: { group: ChipGroup }) {
  return (
    <Block title={group.title}>
      <div className="flex flex-wrap gap-1">
        {group.options.map((o) => (
          <span
            key={o.value}
            className={cn(
              'cursor-pointer rounded-md px-2 py-1 text-[13px]',
              o.value === group.active
                ? 'bg-foreground text-background'
                : 'border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
          </span>
        ))}
      </div>
    </Block>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {title}
      </div>
      {children}
    </div>
  );
}

function Slider({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const pct = (value / max) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span>{label}</span>
        <span className="num text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <div className="h-1 w-full rounded bg-border">
        <div
          className="h-full rounded bg-foreground/80"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Toggle({ label }: { label: string }) {
  return (
    <label className="mb-2 flex cursor-pointer items-center justify-between text-xs text-muted-foreground hover:text-foreground">
      <span>{label}</span>
      <span className="relative h-4 w-7 rounded-full border bg-background/40">
        <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-muted-foreground" />
      </span>
    </label>
  );
}
