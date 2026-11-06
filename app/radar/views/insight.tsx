'use client';

import { useEffect, useRef, useState } from 'react';
import type { Insight, InsightItem, InsightKind } from '@/lib/radar/insight';
import { Chip, ago } from './parts';
import { runJob, sinceStart, waitForJob, type JobState } from './job';

/**
 * 탭별 AI 분석 패널 — 그 탭 데이터로 Claude 가 판정·근거·만드는 법·제목 예시·이어서 볼 것을 낸다.
 * 마지막 결과(탭·범위마다 저장)를 바로 보여 주고, 버튼을 눌러야 새로 분석한다 (Claude 비용).
 */

const TONE: Record<InsightItem['tone'], 'green' | 'amber' | 'red'> = { go: 'green', watch: 'amber', avoid: 'red' };
/** 이보다 오래된 분석은 '오래됨' 표시 */
const STALE_MS = 12 * 3_600_000;

export type InsightQuery = Record<string, string | number | string[] | undefined>;

function qs(kind: InsightKind, q: InsightQuery): string {
  const sp = new URLSearchParams({ kind });
  for (const [k, v] of Object.entries(q)) {
    if (v == null || (Array.isArray(v) && !v.length)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return sp.toString();
}

export function AiInsight({
  kind,
  query = {},
  what,
  onResult,
}: {
  kind: InsightKind;
  query?: InsightQuery;
  /** 무엇을 분석하나 — 버튼 옆 한 줄 */
  what: string;
  /** 결과가 생기거나 바뀌면 (막 뜨는 작품 카드에 판정을 붙일 때) */
  onResult?: (insight: Insight | null) => void;
}) {
  const key = qs(kind, query);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [hasKey, setHasKey] = useState(true);
  const [label, setLabel] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const url = `/api/radar/insight?${key}`;
  // 분석 도중 기간·분류를 바꾸면 이전 범위의 결과를 이 화면에 붙이지 않게
  const keyRef = useRef(key);
  keyRef.current = key;
  // 분석은 서버에서 백그라운드로 돈다 — 끝났는지 몇 초마다 묻기만 (연결이 끊겨도 결과는 남는다)
  const pick = (d: { insight?: Insight | null }) => d.insight ?? null;
  const follow = async (p: Promise<Insight>, alive: () => boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const ins = await p;
      if (!alive()) return;
      setInsight(ins);
      setOpen(true);
      onResult?.(ins);
    } catch (e) {
      if (alive() && (e as Error).message !== 'cancelled') setErr((e as Error).message);
    } finally {
      if (alive()) setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setErr(null);
    setBusy(false);
    fetch(url)
      .then((r) => r.json())
      .then((d: { ok: boolean; insight?: Insight | null; hasKey?: boolean; scopeLabel?: string; job?: JobState | null }) => {
        if (!alive) return;
        setInsight(d.insight ?? null);
        setHasKey(d.hasKey !== false);
        setLabel(d.scopeLabel ?? '');
        onResult?.(d.insight ?? null);
        if (d.job?.status === 'running') {
          setStartedAt(Date.now() - sinceStart(d.job) * 1000);
          follow(waitForJob(url, pick, () => alive), () => alive);
        }
      })
      .catch(() => alive && setInsight(null))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 범위가 바뀔 때만
  }, [key]);

  useEffect(() => {
    if (!busy) return;
    const tick = () => setElapsed(Math.round((Date.now() - (startedAt || Date.now())) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [busy, startedAt]);

  const run = () => {
    setStartedAt(Date.now());
    setElapsed(0);
    const myKey = key;
    follow(runJob(url, pick), () => keyRef.current === myKey);
  };

  const stale = insight && Date.now() - new Date(insight.generatedAt).getTime() > STALE_MS;

  return (
    <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-extrabold">AI 분석</span>
        {label && <Chip>{label}</Chip>}
        <span className="min-w-0 flex-1 text-[12px] font-semibold text-muted-foreground">
          {insight ? (
            <>
              {ago(insight.generatedAt)} 분석 · 약 {insight.costKrw.toLocaleString()}원
              {stale && <span style={{ color: 'var(--amber)' }}> · 오래된 분석 — 다시 분석해 보세요</span>}
            </>
          ) : loaded ? (
            what
          ) : (
            '불러오는 중…'
          )}
          {!hasKey && <span style={{ color: 'var(--red)' }}> · Claude API 키가 없습니다 (설정 → API 키)</span>}
        </span>
        {insight && (
          <button onClick={() => setOpen(!open)} className="h-8 rounded-[10px] px-3 text-[12.5px] font-bold" style={{ background: 'var(--chip)' }}>
            {open ? '접기' : '펼치기'}
          </button>
        )}
        <button
          onClick={run}
          disabled={busy || !hasKey}
          className="h-8 rounded-[10px] bg-brand px-3 text-[12.5px] font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy ? `분석 중… ${elapsed}초` : insight ? '다시 분석' : 'AI로 분석하기'}
        </button>
      </div>
      {err && <p className="mt-2 text-[12.5px] font-semibold" style={{ color: 'var(--red)' }}>{err}</p>}
      {insight && open && <InsightBody insight={insight} />}
    </div>
  );
}

function InsightBody({ insight }: { insight: Insight }) {
  const { result } = insight;
  return (
    <div className="mt-3 space-y-4">
      {result.headline && <p className="text-[15px] font-bold leading-relaxed">{result.headline}</p>}
      {result.todo.length > 0 && (
        <div className="rounded-[14px] px-4 py-3" style={{ background: 'var(--chip)' }}>
          <div className="mb-1 text-[12px] font-extrabold text-[color:var(--text-faint)]">오늘 할 일</div>
          <ol className="list-decimal space-y-0.5 pl-5 text-[13px] font-semibold">
            {result.todo.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
        </div>
      )}
      {result.sections.map((sec) => (
        <section key={sec.title}>
          <h3 className="mb-2 text-[14px] font-extrabold">{sec.title}</h3>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {sec.items.map((it, i) => (
              <ItemCard key={it.name + i} it={it} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ItemCard({ it, compact = false }: { it: InsightItem; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-1.5 rounded-[16px] border p-3.5'} style={compact ? undefined : { borderColor: 'var(--chip)' }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {it.verdict && <Chip tone={TONE[it.tone]}>{it.verdict}</Chip>}
        {!compact && <span className="text-[14px] font-extrabold">{it.name}</span>}
      </div>
      {it.why && <p className="text-[12.5px] font-semibold leading-relaxed">{it.why}</p>}
      {it.how && (
        <p className="text-[12.5px] font-semibold leading-relaxed text-muted-foreground">
          <span className="font-extrabold text-foreground">만드는 법</span> {it.how}
        </p>
      )}
      {it.titles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {it.titles.map((t) => (
            <CopyTitle key={t} text={t} />
          ))}
        </div>
      )}
      {it.picks.length > 0 && (
        <div className="text-[12px] font-semibold text-muted-foreground">
          <span className="font-extrabold" style={{ color: 'var(--green)' }}>
            이어서
          </span>{' '}
          {it.picks.map((p, i) => (
            <span key={p.title + i} title={p.reason}>
              {i > 0 && ' · '}
              <span className="font-bold text-foreground">{p.title}</span>
              {p.reason && <span className="opacity-80"> ({p.reason})</span>}
            </span>
          ))}
        </div>
      )}
      {it.caution && (
        <p className="text-[12px] font-semibold" style={{ color: 'var(--amber)' }}>
          주의 — {it.caution}
        </p>
      )}
    </div>
  );
}

/** 누르면 복사되는 제목 예시 */
function CopyTitle({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          })
          .catch(() => {});
      }}
      title="눌러서 복사"
      className="max-w-full truncate rounded-md px-2 py-0.5 text-left text-[12px] font-bold"
      style={{ background: 'var(--chip)' }}
    >
      {done ? '복사됨 ✓' : `「${text}」`}
    </button>
  );
}
