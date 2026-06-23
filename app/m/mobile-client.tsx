'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type FeedRow = {
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
  viewCount: number | null;
  prevViewCount: number | null;
  score: number | null;
  prevScore: number | null;
  lang: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
};

const TABS: { key: FeedRow['tab']; label: string; emoji: string }[] = [
  { key: 'community', label: '커뮤니티', emoji: '💬' },
  { key: 'news', label: '뉴스', emoji: '📰' },
  { key: 'reddit', label: '레딧', emoji: '🌐' },
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

export function MobileFeedClient({
  rows,
  warning,
  lastRunAt,
}: {
  rows: FeedRow[];
  warning: string | null;
  lastRunAt: string | null;
}) {
  const [tab, setTab] = useState<FeedRow['tab']>('community');
  const [source, setSource] = useState<string>('ALL');
  const [translated, setTranslated] = useState(false);
  const [tmap, setTmap] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const router = useRouter();

  const counts = useMemo(() => {
    const c: Record<string, number> = { community: 0, news: 0, reddit: 0 };
    for (const r of rows) c[r.tab] = (c[r.tab] ?? 0) + 1;
    return c;
  }, [rows]);

  const tabRows = useMemo(
    () =>
      rows
        .filter((r) => r.tab === tab)
        .sort((a, b) => {
          if (source !== 'ALL') return a.rank - b.rank;
          const ta = new Date(a.firstSeenAt).getTime();
          const tb = new Date(b.firstSeenAt).getTime();
          if (Math.abs(tb - ta) < 60_000) return a.rank - b.rank;
          return tb - ta;
        }),
    [rows, tab, source]
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

  const visible = useMemo(
    () => (source === 'ALL' ? tabRows : tabRows.filter((r) => r.source === source)),
    [tabRows, source]
  );

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
      const byLang = new Map<string, FeedRow[]>();
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
      alert('번역 실패');
    } finally {
      setTranslating(false);
    }
  }

  async function runNow() {
    if (running) return;
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch('/api/v1/discovery/run', { method: 'POST' });
      const text = await res.text();
      let data: { success?: boolean; data?: { saved: number; report: Record<string, number | string> }; error?: { message?: string } } | null = null;
      try { data = JSON.parse(text); } catch {}
      if (!res.ok || !data?.success) {
        setRunMsg(`❌ ${data?.error?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setRunMsg(`✅ ${data.data!.saved}건 수집됨`);
      router.refresh();
    } catch (e) {
      setRunMsg(`❌ ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-xl flex-col bg-background">
      {/* Sticky 헤더 */}
      <div className="sticky top-14 z-20 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div>
            <h1 className="text-lg font-bold leading-tight">커뮤니티 / 뉴스</h1>
            {lastRunAt && (
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                마지막 수집 · {formatKst(lastRunAt)}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={runNow}
              disabled={running}
              className="grid h-10 w-10 place-items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-base text-emerald-400 active:bg-emerald-500/20 disabled:opacity-50"
              aria-label="수동 수집"
            >
              {running ? '…' : '🔄'}
            </button>
            {hasForeign && (
              <button
                onClick={toggleTranslate}
                disabled={translating}
                className={`grid h-10 w-10 place-items-center rounded-full border text-base active:bg-accent disabled:opacity-50 ${
                  translated ? 'border-blue-500 bg-blue-500/15 text-blue-400' : 'border-border'
                }`}
                aria-label="번역"
              >
                {translating ? '…' : '🌐'}
              </button>
            )}
          </div>
        </div>

        {/* 탭 */}
        <div className="mt-3 flex gap-1 px-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSource('ALL');
              }}
              className={`flex-1 rounded-t-lg border-b-2 px-2 py-2.5 text-[14px] font-semibold transition ${
                tab === t.key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {t.emoji} {t.label}
              <span className="ml-1 text-[12px] opacity-60">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* 출처 칩 */}
        {tab !== 'news' && sources.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap border-t px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ChipBtn active={source === 'ALL'} onClick={() => setSource('ALL')}>
              전체 {tabRows.length}
            </ChipBtn>
            {sources.map((s) => (
              <ChipBtn
                key={s.key}
                active={source === s.key}
                onClick={() => setSource(s.key)}
                dot={colorFor(s.key)}
              >
                {FLAG[s.country] ?? ''} {s.label} {s.n}
              </ChipBtn>
            ))}
          </div>
        )}
      </div>

      {runMsg && (
        <div className="mx-4 mt-3 rounded-lg border bg-accent/40 px-3 py-2 text-[13px] text-muted-foreground">
          {runMsg}
        </div>
      )}
      {warning && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-300">
          {warning}
        </div>
      )}

      {/* 카드 리스트 */}
      {visible.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? '수집된 글이 없습니다. 🔄 눌러 수집' : '결과 없음'}
        </p>
      ) : (
        <ul className="space-y-2 px-3 py-3">
          {visible.map((r, i) => {
            const title = translated && tmap[r.id] ? tmap[r.id] : r.title;
            const cDelta = delta(r.commentCount, r.prevCommentCount);
            const vDelta = delta(r.viewCount, r.prevViewCount);
            const sDelta = delta(r.score, r.prevScore);
            const ts = r.publishedAt ?? r.firstSeenAt;
            const useFirstSeen = !r.publishedAt;
            return (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 rounded-xl border bg-card/40 p-3 transition active:bg-accent/60"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center self-start rounded-full bg-secondary text-sm font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  {r.thumbnailUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={r.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span
                      className="grid h-16 w-16 shrink-0 place-items-center rounded-lg text-2xl"
                      style={{ backgroundColor: colorFor(r.source) + '30' }}
                    >
                      {FLAG[r.country] ?? '📄'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] font-medium leading-snug">
                      {title}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: colorFor(r.source) }}
                        />
                        <span className="font-medium">{r.sourceLabel ?? r.source}</span>
                      </span>
                      <RankBadge rank={r.rank} prevRank={r.prevRank} />
                      {ts && (
                        <span className="opacity-70">
                          · {useFirstSeen ? '발견 ' : ''}{formatRelative(new Date(ts))}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                      {r.viewCount != null && (
                        <span>👁 {fmt(r.viewCount)}{vDelta > 0 && <DeltaSpan d={vDelta} />}</span>
                      )}
                      {r.commentCount != null && (
                        <span>💬 {fmt(r.commentCount)}{cDelta > 0 && <DeltaSpan d={cDelta} />}</span>
                      )}
                      {r.score != null && (
                        <span>▲ {fmt(r.score)}{sDelta > 0 && <DeltaSpan d={sDelta} />}</span>
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

function ChipBtn({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition active:scale-95 ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-muted-foreground'
      }`}
    >
      {dot && (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {children}
    </button>
  );
}

function RankBadge({ rank, prevRank }: { rank: number; prevRank: number | null }) {
  if (prevRank == null) {
    return (
      <span className="rounded bg-pink-500/15 px-1 text-[11px] font-bold text-pink-400">
        NEW
      </span>
    );
  }
  const diff = prevRank - rank;
  if (diff === 0) return null;
  return diff > 0 ? (
    <span className="text-[12px] font-semibold text-emerald-400">▲{diff}</span>
  ) : (
    <span className="text-[12px] font-semibold text-rose-400">▼{-diff}</span>
  );
}

function DeltaSpan({ d }: { d: number }) {
  const sign = d > 0 ? '+' : '';
  return <span className="ml-0.5 text-emerald-400">({sign}{fmt(d)})</span>;
}

function delta(cur: number | null, prev: number | null | undefined): number {
  if (cur == null || prev == null) return 0;
  return cur - prev;
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}

function formatKst(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).replace(/\.\s?$/, '');
}

function formatRelative(d: Date): string {
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return '방금';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
