'use client';

import { useEffect, useState } from 'react';
import { CATEGORY_LABEL } from '@/lib/radar/types';
import type { MatchAdmin, WorkPick } from '@/lib/radar/fix';
import {
  assignVideoWorkAction,
  blockAliasAction,
  confirmGuessAction,
  matchAdminAction,
  searchWorksAction,
  unblockAliasAction,
  unmatchVideoAction,
  workAliasesAction,
} from '../actions';
import { Chip, Empty, ago, short } from './parts';

/**
 * 작품 인식 직접 고치기.
 *  - WorkChip: 터진 영상 카드의 작품 이름. 누르면 「이 작품 아님」·「'#말'은 작품 아님」·「다른 작품으로」
 *  - WorkAliasFix: 막 뜨는 작품 카드의 「잘못 잡힘?」 — 이 작품으로 붙게 한 말들을 보고 막는다
 *  - MatchFixView: 작품 인식 관리 — 추정 목록, 배운 별칭, 막은 별칭
 */

const TMDB_IMG = process.env.NEXT_PUBLIC_TMDB_IMG_BASE || 'https://image.tmdb.org/t/p';

function Pop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <button aria-label="닫기" className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
      <div
        className="card-surface absolute left-0 top-full z-50 mt-1 w-[280px] space-y-1.5 rounded-xl border p-2.5 text-[12.5px] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}

const btn = 'block w-full rounded-lg px-2 py-1.5 text-left font-bold hover:bg-[var(--chip)] disabled:opacity-40';

/** 다른 작품 찾기 (TMDB) → 고르면 onPick */
function WorkSearch({ initial, onPick }: { initial: string; onPick: (w: WorkPick, remember: boolean) => void }) {
  const [q, setQ] = useState(initial);
  const [rows, setRows] = useState<WorkPick[] | null>(null);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setRows(await searchWorksAction(q).catch(() => []));
    setBusy(false);
  };
  return (
    <div className="space-y-1.5">
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="작품 이름"
          className="h-8 min-w-0 flex-1 rounded-lg border-0 px-2 text-[12.5px] outline-none"
          style={{ background: 'var(--chip)' }}
          autoFocus
        />
        <button className="h-8 rounded-lg bg-brand px-2.5 text-[12px] font-bold text-brand-foreground" disabled={busy}>
          찾기
        </button>
      </form>
      {initial && (
        <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          ‘{initial}’ 도 앞으로 이 작품으로
        </label>
      )}
      {rows && rows.length === 0 && <p className="text-[12px] text-muted-foreground">못 찾았습니다</p>}
      <div className="max-h-[220px] space-y-1 overflow-y-auto">
        {rows?.map((w) => (
          <button key={`${w.mediaType}:${w.tmdbId}`} className={btn + ' flex items-center gap-2'} onClick={() => onPick(w, remember)}>
            <span className="block h-[42px] w-[28px] shrink-0 overflow-hidden rounded" style={{ background: 'var(--chip)' }}>
              {w.posterPath && (
                // eslint-disable-next-line @next/next/no-img-element -- TMDB 포스터
                <img src={`${TMDB_IMG}/w92${w.posterPath}`} alt="" className="h-full w-full object-cover" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate">{w.title}</span>
              <span className="block text-[11px] font-semibold text-[color:var(--text-faint)]">
                {CATEGORY_LABEL[w.category]} {w.year ?? ''}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 터진 영상 카드의 작품 이름 — 누르면 고치기 */
export function WorkChip({
  videoId,
  work,
  guess,
  matchedBy,
}: {
  videoId: string;
  work: string | null;
  guess: string | null;
  matchedBy: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'search'>('menu');
  const [state, setState] = useState<{ work: string | null; guess: string | null; note?: string }>({ work, guess });
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, next: typeof state) => {
    setBusy(true);
    await fn().catch(() => {});
    setState(next);
    setBusy(false);
    setOpen(false);
  };
  const label = state.work ?? (state.guess ? `추정: ${state.guess}` : null);
  return (
    <span className="relative block">
      <button
        onClick={() => {
          setMode(label ? 'menu' : 'search');
          setOpen(true);
        }}
        className="max-w-full truncate text-left text-[11.5px] font-bold hover:underline"
        style={{ color: state.work ? 'var(--accent-solid)' : 'var(--text-faint)' }}
        title="작품 고치기"
      >
        {label ?? state.note ?? '+ 작품 지정'}
      </button>
      {open && (
        <Pop onClose={() => setOpen(false)}>
          {mode === 'menu' ? (
            <>
              {matchedBy && <p className="px-2 text-[11.5px] font-semibold text-[color:var(--text-faint)]">근거: {matchedBy}</p>}
              {!state.work && state.guess && (
                <button className={btn} disabled={busy} onClick={() => act(() => confirmGuessAction(videoId), { work: state.guess, guess: null })}>
                  ✓ 맞음 — {state.guess} 로 확정
                </button>
              )}
              <button className={btn} disabled={busy} onClick={() => act(() => unmatchVideoAction(videoId), { work: null, guess: null, note: '작품 없음' })}>
                ✕ 이 영상은 작품 아님
              </button>
              {matchedBy && matchedBy !== '직접 지정' && (
                <button className={btn} disabled={busy} onClick={() => act(() => blockAliasAction(matchedBy), { work: null, guess: null, note: '다시 찾는 중' })}>
                  ⊘ ‘{matchedBy}’ 는 작품 아님 (다른 영상에도)
                </button>
              )}
              <button className={btn} disabled={busy} onClick={() => setMode('search')}>
                ↺ 다른 작품으로…
              </button>
            </>
          ) : (
            <WorkSearch
              initial={matchedBy && matchedBy !== '직접 지정' ? matchedBy : ''}
              onPick={(w, remember) =>
                act(() => assignVideoWorkAction(videoId, w, remember && matchedBy && matchedBy !== '직접 지정' ? matchedBy : undefined), {
                  work: w.title,
                  guess: null,
                })
              }
            />
          )}
        </Pop>
      )}
    </span>
  );
}

/** 막 뜨는 작품 카드의 「잘못 잡힘?」 — 이 작품으로 붙게 한 말들 */
export function WorkAliasFix({ workId }: { workId: string }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ text: string; count: number }[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open && !rows) workAliasesAction(workId).then(setRows).catch(() => setRows([]));
  }, [open, rows, workId]);
  return (
    <span className="relative inline-block">
      <button onClick={() => setOpen(true)} className="text-[11.5px] font-bold text-[color:var(--text-faint)] hover:text-foreground">
        잘못 잡힘?
      </button>
      {open && (
        <Pop onClose={() => setOpen(false)}>
          <p className="px-1 text-[11.5px] font-semibold text-muted-foreground">이 작품으로 붙게 한 말 — 작품이 아닌 말을 막으면 그 영상들을 다시 찾습니다</p>
          {!rows ? (
            <p className="px-1 text-[12px]">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="px-1 text-[12px]">직접 지정한 영상뿐입니다</p>
          ) : (
            rows.map((r) => (
              <div key={r.text} className="flex items-center justify-between gap-2 px-1">
                <span className="truncate font-bold">
                  {r.text} <span className="num font-semibold text-[color:var(--text-faint)]">{r.count}</span>
                </span>
                <button
                  disabled={done.has(r.text)}
                  onClick={async () => {
                    await blockAliasAction(r.text).catch(() => {});
                    setDone((d) => new Set(d).add(r.text));
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-bold hover:bg-[var(--chip)] disabled:opacity-40"
                >
                  {done.has(r.text) ? '막음' : '막기'}
                </button>
              </div>
            ))
          )}
        </Pop>
      )}
    </span>
  );
}

/** 작품 인식 관리 */
export function MatchFixView() {
  const [data, setData] = useState<MatchAdmin | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'guess' | 'learned' | 'blocked'>('guess');
  const load = () => matchAdminAction().then(setData).catch((e) => setErr((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  if (err) return <Empty>불러오지 못했습니다 — {err}</Empty>;
  if (!data) return <Empty>불러오는 중…</Empty>;
  const s = data.stats;
  const tabs: { k: typeof tab; label: string; n: number }[] = [
    { k: 'guess', label: '추정 (확인 필요)', n: data.guesses.length },
    { k: 'learned', label: '배운·정한 별칭', n: data.learned.length },
    { k: 'blocked', label: '막은 별칭', n: data.blocked.length },
  ];
  return (
    <>
      <div className="mb-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">작품 인식</h1>
        <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
          제목·설명란 해시태그·출처·영상 태그로 작품을 찾고, 같이 붙는 해시태그로 별칭을 배우고, 작품과 상관없는 채널에서만 나오는 말은 막습니다
        </p>
      </div>
      <div className="card-surface mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold">
        최근 14일 — 확정 <span className="num">{s.confident.toLocaleString('ko-KR')}</span> · 추정{' '}
        <span className="num">{s.guess.toLocaleString('ko-KR')}</span> · 작품 없음 <span className="num">{s.none.toLocaleString('ko-KR')}</span> · 직접 고침{' '}
        <span className="num">{s.locked.toLocaleString('ko-KR')}</span>
        <span className="ml-1 text-[12px] text-[color:var(--text-faint)]">(집계에는 확정만 씁니다)</span>
      </div>
      <div className="mb-3 flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className="h-8 rounded-[10px] px-3 text-[12.5px] font-bold"
            style={{ background: tab === t.k ? 'var(--accent-solid)' : 'var(--chip)', color: tab === t.k ? 'var(--on-accent, #fff)' : undefined }}
          >
            {t.label} <span className="num opacity-70">{t.n}</span>
          </button>
        ))}
      </div>

      {tab === 'guess' && (
        <div className="card-surface overflow-hidden rounded-[18px]">
          {data.guesses.length === 0 && <p className="p-5 text-center text-[13px] font-semibold text-muted-foreground">확인할 추정이 없습니다</p>}
          {data.guesses.map((g) => (
            <div key={g.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0" style={{ borderColor: 'var(--chip)' }}>
              <div className="min-w-0 flex-1">
                <a href={`https://www.youtube.com/shorts/${g.id}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[13px] font-bold hover:underline">
                  {g.title}
                </a>
                <div className="num text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                  {short(g.views)}회 · {g.channel} · {ago(g.publishedAt)} · 근거 {g.by ?? '–'} ({g.score?.toFixed(1) ?? '–'}점)
                </div>
              </div>
              <div className="w-[180px] shrink-0">
                <WorkChip videoId={g.id} work={null} guess={g.guess} matchedBy={g.by} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'learned' && (
        <div className="card-surface overflow-hidden rounded-[18px]">
          {data.learned.length === 0 && (
            <p className="p-5 text-center text-[13px] font-semibold text-muted-foreground">아직 배운 별칭이 없습니다 (6시간마다 같이 붙는 해시태그를 보고 배웁니다)</p>
          )}
          {data.learned.map((l) => (
            <AliasRow key={l.alias} alias={l.alias} right={<Chip>{l.work ?? '–'}</Chip>} action="막기" onAction={() => blockAliasAction(l.alias).then(load)} />
          ))}
        </div>
      )}

      {tab === 'blocked' && (
        <div className="card-surface overflow-hidden rounded-[18px]">
          {data.blocked.length === 0 && <p className="p-5 text-center text-[13px] font-semibold text-muted-foreground">막은 별칭이 없습니다</p>}
          {data.blocked.map((b) => (
            <AliasRow
              key={b.alias}
              alias={b.alias}
              right={<span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">{b.reason ?? ''}{b.work ? ` · 원래 ${b.work}` : ''}</span>}
              action="풀기"
              onAction={() => unblockAliasAction(b.alias).then(load)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AliasRow({ alias, right, action, onAction }: { alias: string; right: React.ReactNode; action: string; onAction: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2 last:border-0" style={{ borderColor: 'var(--chip)' }}>
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold">#{alias}</span>
      <span className="min-w-0 truncate">{right}</span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onAction().catch(() => {});
          setBusy(false);
        }}
        className="h-7 shrink-0 rounded-lg px-2.5 text-[12px] font-bold disabled:opacity-40"
        style={{ background: 'var(--chip)' }}
      >
        {action}
      </button>
    </div>
  );
}
