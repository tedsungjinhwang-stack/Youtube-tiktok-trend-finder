'use client';

import { useEffect, useState, useTransition } from 'react';
import { Pill } from '../../trends/ui';
import { hotVideosAction, watchFoldersByNameAction } from '../actions';
import type { HotResult, HotSort, HotVideo, HotWindow } from '@/lib/radar/queries';
import { WorkChip } from './fix';
import { Chip, Empty, StatusLine, Toggle, VideoThumb, ago, short } from './parts';

/**
 * 터진 영상 — 감시 채널의 최근 영상 중 지금 조회가 빠르게 느는 것.
 * 수집기가 72시간 안 영상은 매시간 조회수를 재서 N시간 동안 늘어난 만큼으로 줄 세운다.
 */

const WINDOWS: HotWindow[] = [1, 3, 6, 12, 24];
const SORTS: { key: HotSort; label: string }[] = [
  { key: 'rising', label: '급상승' },
  { key: 'views', label: '조회수' },
  { key: 'latest', label: '최신' },
];

export type HotPreset = {
  title: string;
  subtitle: string;
  /** 이 채널팩들만 */
  folders?: string[];
  format?: 'shorts' | 'long';
  sort?: HotSort;
  window?: HotWindow;
  /** 화면 위 안내 */
  note?: string;
};

export const HOT_DEFAULT: HotPreset = {
  title: '터진 영상',
  subtitle: '감시 채널 전체에서 지금 조회가 빠르게 느는 영상 — 남들보다 먼저 보고 선점',
};

export function HotView({ preset = HOT_DEFAULT, onWatchlist }: { preset?: HotPreset; onWatchlist: () => void }) {
  const [format, setFormat] = useState<'shorts' | 'long'>(preset.format ?? 'shorts');
  const [win, setWin] = useState<HotWindow>(preset.window ?? 1);
  const [sort, setSort] = useState<HotSort>(preset.sort ?? 'rising');
  const [reload, setReload] = useState(0);
  const [excludeWhale, setExcludeWhale] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [data, setData] = useState<HotResult | null>(null);
  const [shown, setShown] = useState(40);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 다른 묶음 화면으로 바뀌면 그 화면의 기본값으로
  useEffect(() => {
    setFormat(preset.format ?? 'shorts');
    setWin(preset.window ?? 1);
    setSort(preset.sort ?? 'rising');
    setFolder(null);
  }, [preset]);

  useEffect(() => {
    let alive = true;
    start(async () => {
      try {
        const r = await hotVideosAction({ format, window: win, sort, excludeWhale, folders: preset.folders });
        if (!alive) return;
        setData(r);
        setShown(40);
        setErr(null);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    });
    return () => {
      alive = false;
    };
  }, [format, win, sort, excludeWhale, preset, reload]);

  const watchAll = async () => {
    if (!data?.unwatched.length) return;
    await watchFoldersByNameAction(data.unwatched);
    setReload((n) => n + 1);
  };

  const items = (data?.items ?? []).filter((it) => !folder || it.folderId === folder);
  const vertical = format === 'shorts';

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">{preset.title}</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">{preset.subtitle}</p>
        </div>
        {data && <StatusLine s={data.status} />}
      </div>

      {preset.note && <div className="card-surface mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold">{preset.note}</div>}
      {data && data.unwatched.length > 0 && !data.status.allHourly && (
        <div className="surface-warn mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold">
          <span>
            {data.unwatched.join(' · ')} 채널팩은 3시간마다 잽니다. 관심 목록에 넣으면 매시간 (1시간 급상승까지).
          </span>
          <button onClick={watchAll} className="h-8 rounded-[10px] bg-brand px-3 text-[12.5px] font-bold text-brand-foreground">
            관심 목록에 넣기 (매시간)
          </button>
        </div>
      )}

      <div className="card-surface theme-fade mb-3 space-y-2.5 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill strong active={format === 'shorts'} onClick={() => setFormat('shorts')}>
            쇼츠
          </Pill>
          <Pill strong active={format === 'long'} onClick={() => setFormat('long')}>
            롱폼
          </Pill>
          <span className="mx-1 h-4 w-px" style={{ background: 'var(--chip)' }} />
          {WINDOWS.map((w) => (
            <Pill key={w} active={win === w} onClick={() => setWin(w)}>
              {w}시간
            </Pill>
          ))}
          <span className="mx-1 h-4 w-px" style={{ background: 'var(--chip)' }} />
          {SORTS.map((s) => (
            <Pill key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
              {s.label}
            </Pill>
          ))}
          <span className="ml-auto">
            <Toggle on={excludeWhale} onClick={() => setExcludeWhale(!excludeWhale)}>
              대형채널 제외
            </Toggle>
          </span>
        </div>
        {data && data.folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Pill active={!folder} onClick={() => setFolder(null)}>
              전체 <span className="num ml-0.5 opacity-70">{data.items.length}</span>
            </Pill>
            {data.folders.map((f) => (
              <Pill key={f.id} active={folder === f.id} onClick={() => setFolder(folder === f.id ? null : f.id)}>
                {f.name} <span className="num ml-0.5 opacity-70">{f.count}</span>
              </Pill>
            ))}
          </div>
        )}
      </div>

      {err ? (
        <Empty>불러오지 못했습니다 — {err}</Empty>
      ) : !data ? (
        <Empty>불러오는 중…</Empty>
      ) : items.length === 0 ? (
        <Empty>
          아직 보여줄 영상이 없습니다.
          <br />
          감시를 시작한 뒤 올라온 영상부터 모으고, 시간당 증가는 같은 영상을 두 번 이상 재야 나옵니다 (
          {data.status.allHourly ? '1~2시간 뒤' : '관심 목록은 1~2시간, 나머지는 3~6시간 뒤'}).
          <div className="mt-3">
            <button onClick={onWatchlist} className="h-9 rounded-xl bg-brand px-4 text-[13px] font-bold text-brand-foreground">
              관심 목록 열기
            </button>
          </div>
        </Empty>
      ) : (
        <>
          <div
            className={
              'grid gap-2.5 ' +
              (vertical ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3') +
              (pending ? ' opacity-60' : '')
            }
          >
            {items.slice(0, shown).map((it, i) => (
              <HotCard key={it.id} it={it} rank={i + 1} vertical={vertical} win={win} sort={sort} />
            ))}
          </div>
          {items.length > shown && (
            <button onClick={() => setShown(shown + 40)} className="mt-3 w-full rounded-xl py-3 text-[13px] font-bold text-muted-foreground hover:text-foreground" style={{ background: 'var(--chip)' }}>
              더 보기 ({items.length - shown})
            </button>
          )}
        </>
      )}
    </>
  );
}

function badgeTone(b: string): 'red' | 'amber' | 'green' | 'plain' {
  if (b === 'Hot') return 'red';
  if (b === '가속' || b.startsWith('평소')) return 'amber';
  if (b === '초신규' || b === '역주행') return 'green';
  return 'plain';
}

function HotCard({ it, rank, vertical, win, sort }: { it: HotVideo; rank: number; vertical: boolean; win: HotWindow; sort: HotSort }) {
  return (
    <div className="card-surface theme-fade flex flex-col overflow-hidden rounded-[18px]">
      <VideoThumb id={it.id} src={it.thumbnailUrl} vertical={vertical} className="w-full rounded-none">
        <span className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.78), rgba(0,0,0,0) 50%)' }} />
        <span className="num absolute left-2 top-2 rounded-md bg-black/60 px-1.5 text-[12px] font-black text-white">#{rank}</span>
        <span className="absolute bottom-2 left-2.5 right-2.5">
          <span className="num block text-[20px] font-extrabold leading-none text-white">{short(it.views)}</span>
          {sort === 'rising' && it.perHour != null && (
            <span className="num mt-1 block text-[12px] font-bold text-white/85">+{short(it.perHour)}/h · 최근 {win}시간</span>
          )}
        </span>
      </VideoThumb>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        {it.badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {it.badges.map((b) => (
              <Chip key={b} tone={badgeTone(b)}>
                {b}
              </Chip>
            ))}
          </div>
        )}
        <a
          href={vertical ? `https://www.youtube.com/shorts/${it.id}` : `https://www.youtube.com/watch?v=${it.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-[13px] font-bold leading-snug hover:underline"
          title={it.title}
        >
          {it.title}
        </a>
        {/* 작품 이름 — 누르면 고치기 (이 작품 아님 · 이 말은 작품 아님 · 다른 작품으로) */}
        <WorkChip videoId={it.id} work={it.work} guess={it.guess} matchedBy={it.matchedBy} />
        <a
          href={`https://www.youtube.com/channel/${it.channelExternalId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
        >
          {it.channelThumb && (
            // eslint-disable-next-line @next/next/no-img-element -- 채널 썸네일
            <img src={it.channelThumb} alt="" className="h-4 w-4 shrink-0 rounded-full" loading="lazy" />
          )}
          <span className="truncate">{it.channelName}</span>
        </a>
        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-1 text-[11.5px] font-semibold text-[color:var(--text-faint)]">
          <span>{it.folder}</span>
          <span>{ago(it.publishedAt)}</span>
          <span className="num" title="게시 이후 시간당 평균">평균 {short(it.avgPerHour)}/h</span>
          {it.accel != null && (
            <span className="num" title="최근 1시간 증가 ÷ 게시 이후 시간당 평균">
              가속 {it.accel.toFixed(1)}배
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
