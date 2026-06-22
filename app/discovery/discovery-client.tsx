'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type DiscoveryRow = {
  id: string;
  tab: 'community' | 'news' | 'reddit';
  country: string;
  source: string;
  sourceLabel: string | null;
  rank: number;
  prevRank: number | null;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  commentCount: number | null;
  prevCommentCount: number | null;
  score: number | null;
  prevScore: number | null;
  lang: string | null;
  collectedAt: string;
  firstSeenAt: string;
};

const TABS: { key: DiscoveryRow['tab']; label: string }[] = [
  { key: 'community', label: '커뮤니티' },
  { key: 'news', label: '뉴스' },
  { key: 'reddit', label: '레딧' },
];

const FLAG: Record<string, string> = {
  KR: '🇰🇷',
  JP: '🇯🇵',
  DE: '🇩🇪',
  GLOBAL: '🌐',
};

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#06b6d4',
];
function colorFor(source: string): string {
  let h = 0;
  for (let i = 0; i < source.length; i++) h = (h * 31 + source.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function DiscoveryClient({
  rows,
  warning,
  lastRunAt,
}: {
  rows: DiscoveryRow[];
  warning: string | null;
  lastRunAt: string | null;
}) {
  const [tab, setTab] = useState<DiscoveryRow['tab']>('community');
  const [source, setSource] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [translated, setTranslated] = useState(false);
  const [tmap, setTmap] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [relTime, setRelTime] = useState('');
  const router = useRouter();

  // "N분 전" 같이 매분 갱신
  useEffect(() => {
    if (!lastRunAt) {
      setRelTime('');
      return;
    }
    const update = () => setRelTime(formatRelative(new Date(lastRunAt)));
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [lastRunAt]);

  async function runNow() {
    if (running) return;
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch('/api/v1/discovery/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const msg = data?.error?.message ?? `HTTP ${res.status}`;
        setRunMsg(`❌ 실패: ${msg}`);
        return;
      }
      const r = data.data.report as Record<string, number | string>;
      const parts = Object.entries(r)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ');
      setRunMsg(`✅ ${data.data.saved}건 수집 (${parts})`);
      router.refresh();
    } catch (e) {
      setRunMsg(`❌ ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { community: 0, news: 0, reddit: 0 };
    for (const r of rows) c[r.tab] = (c[r.tab] ?? 0) + 1;
    return c;
  }, [rows]);

  const tabRows = useMemo(
    () => rows.filter((r) => r.tab === tab).sort((a, b) => a.rank - b.rank),
    [rows, tab]
  );

  const sources = useMemo(() => {
    const map = new Map<string, { label: string; country: string; n: number }>();
    for (const r of tabRows) {
      const prev = map.get(r.source);
      map.set(r.source, {
        label: r.sourceLabel ?? r.source,
        country: r.country,
        n: (prev?.n ?? 0) + 1,
      });
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v }));
  }, [tabRows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tabRows.filter((r) => {
      if (source !== 'ALL' && r.source !== source) return false;
      if (q) {
        const t = (tmap[r.id] ?? r.title).toLowerCase();
        if (!t.includes(q) && !r.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tabRows, source, query, tmap]);

  const hasForeign = useMemo(
    () => rows.some((r) => r.lang && r.lang !== 'ko'),
    [rows]
  );

  async function toggleTranslate() {
    if (translated) {
      setTranslated(false);
      return;
    }
    const need = rows.filter((r) => r.lang && r.lang !== 'ko' && !tmap[r.id]);
    if (need.length === 0) {
      setTranslated(true);
      return;
    }
    setTranslating(true);
    try {
      const byLang = new Map<string, DiscoveryRow[]>();
      for (const r of need) {
        const arr = byLang.get(r.lang!) ?? [];
        arr.push(r);
        byLang.set(r.lang!, arr);
      }
      const next: Record<string, string> = {};
      for (const [lang, items] of byLang) {
        const res = await fetch('/api/v1/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: items.map((i) => i.title), sl: lang, tl: 'ko' }),
        });
        const data = (await res.json()) as { translations?: string[] };
        (data.translations ?? []).forEach((t, idx) => {
          if (t) next[items[idx].id] = t;
        });
      }
      setTmap((m) => ({ ...m, ...next }));
      setTranslated(true);
    } catch {
      alert('번역에 실패했습니다. 잠시 후 다시 시도하세요.');
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">디스커버리</h1>
        <span className="text-sm text-muted-foreground">
          한국·일본 커뮤니티 / 뉴스 / 레딧 인기글
        </span>
        <div className="flex-1" />
        <button
          onClick={runNow}
          disabled={running}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
            running
              ? 'border-border bg-accent opacity-60'
              : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
          }`}
          title="지금 즉시 4개 소스에서 인기글 새로 수집"
        >
          {running ? '수집 중…' : '🔄 수동 수집'}
        </button>
        {hasForeign && (
          <button
            onClick={toggleTranslate}
            disabled={translating}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              translated
                ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                : 'border-border hover:bg-accent'
            } ${translating ? 'opacity-60' : ''}`}
          >
            {translating ? '번역 중…' : translated ? '🌐 원문 보기' : '🌐 한국어 번역'}
          </button>
        )}
      </div>

      {/* 마지막 수집 시각 (한국어 번역 버튼 바로 아래) */}
      <div className="mb-4 text-xs text-muted-foreground">
        {lastRunAt ? (
          <>
            마지막 수집: <span className="font-medium text-foreground">{formatKst(lastRunAt)}</span>
            {relTime && <span className="ml-1.5 opacity-70">({relTime})</span>}
          </>
        ) : (
          <>아직 수집된 데이터가 없습니다.</>
        )}
      </div>

      {runMsg && (
        <div className="mb-3 rounded-lg border border-border bg-accent/40 px-4 py-2 text-xs text-muted-foreground">
          {runMsg}
        </div>
      )}

      {warning && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {warning}
        </div>
      )}

      <div className="mb-3 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setSource('ALL');
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="제목 검색…"
        className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
      />

      {tab !== 'news' && sources.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Chip
            active={source === 'ALL'}
            onClick={() => setSource('ALL')}
            label="전체"
            count={tabRows.length}
          />
          {sources.map((s) => (
            <Chip
              key={s.key}
              active={source === s.key}
              onClick={() => setSource(s.key)}
              label={`${FLAG[s.country] ?? ''} ${s.label}`.trim()}
              count={s.n}
              dot={colorFor(s.key)}
            />
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? '아직 수집된 글이 없습니다. cron 이 한 번 실행되면 채워집니다.'
            : '결과가 없습니다.'}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {visible.map((r, i) => {
            const title = translated && tmap[r.id] ? tmap[r.id] : r.title;
            const cDelta = delta(r.commentCount, r.prevCommentCount);
            const sDelta = delta(r.score, r.prevScore);
            return (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 py-2.5 hover:bg-accent/40"
                >
                  <span className="flex w-10 shrink-0 flex-col items-center pt-0.5">
                    <span className="text-sm font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <RankBadge rank={r.rank} prevRank={r.prevRank} />
                  </span>
                  {r.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span
                      className="mt-0.5 grid h-12 w-12 shrink-0 place-items-center rounded text-[10px] font-bold text-white"
                      style={{ backgroundColor: colorFor(r.source) }}
                    >
                      {FLAG[r.country] ?? ''}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm leading-snug">{title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: colorFor(r.source) }}
                      />
                      {r.sourceLabel ?? r.source}
                      {r.commentCount != null && (
                        <span>
                          💬 {fmt(r.commentCount)}
                          {cDelta !== 0 && <DeltaSpan d={cDelta} />}
                        </span>
                      )}
                      {r.score != null && (
                        <span>
                          ▲ {fmt(r.score)}
                          {sDelta !== 0 && <DeltaSpan d={sDelta} />}
                        </span>
                      )}
                      {translated && tmap[r.id] && (
                        <span className="text-blue-400/80">· 번역됨</span>
                      )}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RankBadge({ rank, prevRank }: { rank: number; prevRank: number | null }) {
  if (prevRank == null) {
    return (
      <span className="mt-0.5 rounded bg-pink-500/15 px-1 text-[9px] font-bold text-pink-400">
        NEW
      </span>
    );
  }
  const diff = prevRank - rank; // 양수 = 순위 상승
  if (diff === 0) {
    return <span className="mt-0.5 text-[10px] text-muted-foreground/60">−</span>;
  }
  if (diff > 0) {
    return (
      <span className="mt-0.5 text-[10px] font-semibold text-emerald-400">
        ▲{diff}
      </span>
    );
  }
  return (
    <span className="mt-0.5 text-[10px] font-semibold text-rose-400">
      ▼{-diff}
    </span>
  );
}

function DeltaSpan({ d }: { d: number }) {
  const cls = d > 0 ? 'text-emerald-400' : 'text-rose-400';
  const sign = d > 0 ? '+' : '';
  return <span className={`ml-0.5 ${cls}`}>({sign}{fmt(d)})</span>;
}

function delta(cur: number | null, prev: number | null | undefined): number {
  if (cur == null || prev == null) return 0;
  return cur - prev;
}

function Chip({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {dot && (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {label}
      <span className="opacity-60">{count}</span>
    </button>
  );
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}

function formatKst(iso: string): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(d).replace(/\.\s?$/, '');
}

function formatRelative(d: Date): string {
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return '방금 전';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
