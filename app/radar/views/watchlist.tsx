'use client';

import { useEffect, useState, useTransition } from 'react';
import { setFolderWatchedAction, watchlistAction } from '../actions';
import type { WatchFolder, WatchlistResult } from '@/lib/radar/queries';
import { Empty, StatusLine, short } from './parts';

/**
 * 관심 목록 — 채널팩(에셋 채널 폴더)을 모아 두는 곳.
 * 살아있는 채널은 전부 감시한다 — 키가 넉넉하면 전부 매시간, 모자라면 관심 목록에 넣은 팩만 매시간·나머지 3~6시간.
 * 팩이 많을수록 유튜브 할당량을 많이 써서, 하루 예상 사용량을 같이 보여 준다.
 */
export function WatchlistView({ onRanking }: { onRanking: (folderId: string) => void }) {
  const [data, setData] = useState<WatchlistResult | null>(null);
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const load = () =>
    start(async () => {
      try {
        setData(await watchlistAction());
        setErr(null);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  useEffect(load, []);

  const toggle = async (f: WatchFolder) => {
    setBusy(f.id);
    // 바로 반영해 보이고, 저장 뒤 숫자를 다시 받는다
    setData((d) => d && { ...d, folders: d.folders.map((x) => (x.id === f.id ? { ...x, watched: !f.watched } : x)) });
    await setFolderWatchedAction(f.id, !f.watched);
    setBusy(null);
    load();
  };

  if (err) return <Empty>불러오지 못했습니다 — {err}</Empty>;
  if (!data) return <Empty>불러오는 중…</Empty>;

  const s = filter.trim();
  const match = (f: WatchFolder) => !s || f.name.includes(s) || (f.description ?? '').includes(s);
  const watched = data.folders.filter((f) => f.watched && match(f));
  const others = data.folders.filter((f) => !f.watched && match(f));
  const total = data.estimatedUnits + data.estimatedOtherUnits;
  const over = data.quotaLimit > 0 && total > data.quotaLimit * 0.9;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">관심 목록</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            {data.status.allHourly
              ? '살아있는 채널은 전부 매시간 감시합니다 — 관심 목록은 키가 모자랄 때 먼저 챙기는 채널팩'
              : '살아있는 채널은 전부 3~6시간마다 감시합니다 — 관심 목록에 넣은 팩은 매시간 정밀하게 (1시간 급상승까지)'}
          </p>
        </div>
        <StatusLine s={data.status} />
      </div>

      <div className={'mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold ' + (over ? 'surface-warn' : 'card-surface')}>
        하루 예상 유튜브 사용량 — 관심 목록 <span className="num">{data.watchedChannels.toLocaleString('ko-KR')}</span>곳 매시간 약{' '}
        <span className="num">{data.estimatedUnits.toLocaleString('ko-KR')}</span> + 나머지{' '}
        <span className="num">{data.otherChannels.toLocaleString('ko-KR')}</span>곳 {data.status.allHourly ? '매시간' : '3~6시간마다'} 약{' '}
        <span className="num">{data.estimatedOtherUnits.toLocaleString('ko-KR')}</span>
        {data.quotaLimit > 0 && (
          <>
            {' '}
            / 키 한도 <span className="num">{data.quotaLimit.toLocaleString('ko-KR')}</span>
          </>
        )}
        {over && ' — 한도보다 많아서 관심 목록 밖 채널은 남는 만큼만 돕니다. 설정 → API 키에서 키(다른 구글 클라우드 프로젝트)를 더 넣으면 촘촘해집니다'}
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="채널팩 찾기"
        className="mb-3 h-9 w-full max-w-[280px] rounded-xl border-0 px-3 text-[13px] font-semibold outline-none"
        style={{ background: 'var(--chip)' }}
      />

      <Section title="관심 목록" count={watched.length}>
        {watched.length === 0 ? (
          <p className="px-1 text-[13px] font-semibold text-muted-foreground">아직 없습니다 — 아래 채널팩에서 넣으세요</p>
        ) : (
          watched.map((f) => <FolderCard key={f.id} f={f} busy={busy === f.id} onToggle={() => toggle(f)} onRanking={() => onRanking(f.id)} />)
        )}
      </Section>
      <Section title="채널팩" count={others.length}>
        {others.map((f) => (
          <FolderCard key={f.id} f={f} busy={busy === f.id} onToggle={() => toggle(f)} onRanking={() => onRanking(f.id)} />
        ))}
      </Section>
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">{title}</h2>
        <span className="num text-[12px] font-semibold text-[color:var(--text-faint)]">{count}</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function FolderCard({ f, busy, onToggle, onRanking }: { f: WatchFolder; busy: boolean; onToggle: () => void; onRanking: () => void }) {
  return (
    <div className="card-surface theme-fade flex flex-col gap-2 rounded-[18px] p-3.5" style={f.watched ? { boxShadow: 'inset 0 0 0 1.5px var(--accent-solid)' } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-extrabold">{f.name}</div>
          {f.description && <div className="line-clamp-1 text-[12px] font-semibold text-[color:var(--text-faint)]">{f.description}</div>}
        </div>
        <button
          onClick={onToggle}
          disabled={busy}
          className={
            'h-8 shrink-0 rounded-[10px] px-3 text-[12.5px] font-bold disabled:opacity-50 ' +
            (f.watched ? 'text-muted-foreground' : 'bg-brand text-brand-foreground')
          }
          style={f.watched ? { background: 'var(--chip)' } : undefined}
        >
          {f.watched ? '빼기' : '+ 넣기'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          {f.top.slice(0, 4).map((c, i) =>
            c.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 채널 썸네일
              <img key={i} src={c.thumbnailUrl} alt="" title={c.name} className="h-7 w-7 rounded-full border-2 object-cover" style={{ borderColor: 'hsl(var(--card))' }} loading="lazy" />
            ) : (
              <span key={i} title={c.name} className="h-7 w-7 rounded-full border-2" style={{ background: 'var(--chip)', borderColor: 'hsl(var(--card))' }} />
            )
          )}
        </div>
        <span className="text-[12px] font-semibold text-muted-foreground">
          살아있는 채널 <span className="num font-bold text-foreground">{f.active.toLocaleString('ko-KR')}</span>
          {f.total > f.active && <span className="num text-[color:var(--text-faint)]"> / {f.total.toLocaleString('ko-KR')}</span>}
          {f.dailyViews > 0 && (
            <>
              {' '}
              · 하루 <span className="num font-bold text-foreground">{short(f.dailyViews)}</span>
            </>
          )}
        </span>
        <button onClick={onRanking} className="ml-auto shrink-0 text-[12px] font-bold text-muted-foreground hover:text-foreground">
          순위 보기 ›
        </button>
      </div>
    </div>
  );
}
