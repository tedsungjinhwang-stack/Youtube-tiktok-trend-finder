'use client';

import { useEffect, useState, useTransition } from 'react';
import { Pill } from '../../trends/ui';
import { rankingAction } from '../actions';
import type { RankFormat, RankPeriod, RankingRow, VideoBrief } from '@/lib/radar/queries';
import { Chip, Empty, FORMAT_LABEL, Spark, Toggle, VideoThumb, ago, channelAge, short } from './parts';

/**
 * 채널 순위 — pint 홈처럼 하루 조회수로 채널을 줄 세운다.
 * 하루 조회수는 유튜브 채널 총 조회수의 하루 증가분 (수집기가 하루 한 번 적는다).
 * 터진 영상·최신 영상은 감시를 시작한 뒤 올라온 영상부터 (관심 목록은 매시간, 나머지는 3~6시간마다 잰다).
 */

const FORMATS: { key: RankFormat; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'shorts', label: '숏폼' },
  { key: 'long', label: '롱폼' },
];
const PERIODS: { key: RankPeriod; label: string; metric: string }[] = [
  { key: '24h', label: '24시간', metric: '하루 조회수' },
  { key: '7d', label: '7일', metric: '7일 조회수' },
  { key: '30d', label: '30일', metric: '30일 조회수' },
  { key: 'accel', label: '급가속', metric: '하루 조회수' },
];

export function RankingView({
  folders,
  folderId,
  onFolder,
}: {
  folders: { id: string; name: string }[];
  folderId: string | null;
  onFolder: (id: string | null) => void;
}) {
  const [format, setFormat] = useState<RankFormat>('all');
  const [period, setPeriod] = useState<RankPeriod>('24h');
  const [excludeWhale, setExcludeWhale] = useState(true);
  const [watchedOnly, setWatchedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [historyDays, setHistoryDays] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);

  const params = { format, period, excludeWhale, folderId, watchedOnly, q: query };

  useEffect(() => {
    let alive = true;
    start(async () => {
      try {
        const r = await rankingAction({ ...params, offset: 0 });
        if (!alive) return;
        setRows(r.rows);
        setTotal(r.total);
        setHasMore(r.hasMore);
        setHistoryDays(r.historyDays);
        setErr(null);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      } finally {
        if (alive) setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 조건이 바뀔 때만
  }, [format, period, excludeWhale, folderId, watchedOnly, query]);

  const more = () =>
    start(async () => {
      const r = await rankingAction({ ...params, offset: rows.length });
      setRows((prev) => [...prev, ...r.rows]);
      setHasMore(r.hasMore);
    });

  const metricLabel = PERIODS.find((p) => p.key === period)!.metric;
  const needHistory = (period === '7d' && historyDays < 8) || (period === '30d' && historyDays < 31);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">채널 순위</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            에셋 채널을 하루 조회수로 줄 세우기 — 지금 돈 되는 채널과 그 채널의 터진 영상
          </p>
        </div>
        <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
          {loaded && <>채널 <span className="num">{total.toLocaleString('ko-KR')}</span>곳</>}
        </span>
      </div>

      <div className="card-surface theme-fade mb-3 space-y-2.5 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {FORMATS.map((f) => (
            <Pill strong key={f.key} active={format === f.key} onClick={() => setFormat(f.key)}>
              {f.label}
            </Pill>
          ))}
          <span className="mx-1 h-4 w-px" style={{ background: 'var(--border-subtle, var(--chip))' }} />
          {PERIODS.map((p) => (
            <Pill key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
              {p.label}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Toggle on={excludeWhale} onClick={() => setExcludeWhale(!excludeWhale)}>
            대형채널 제외 (구독 100만+)
          </Toggle>
          <Toggle on={watchedOnly} onClick={() => setWatchedOnly(!watchedOnly)}>
            관심 목록만
          </Toggle>
          <select
            value={folderId ?? ''}
            onChange={(e) => onFolder(e.target.value || null)}
            className="h-7 rounded-[9px] border-0 px-2 text-[12.5px] font-bold"
            style={{ background: 'var(--chip)' }}
          >
            <option value="">채널팩 전체</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <form
            className="ml-auto flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q);
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="채널 이름 찾기"
              className="h-7 w-[160px] rounded-[9px] border-0 px-2.5 text-[12.5px] font-semibold outline-none"
              style={{ background: 'var(--chip)' }}
            />
          </form>
        </div>
      </div>

      {needHistory && (
        <div className="surface-warn mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold">
          {period === '7d' ? '7일' : '30일'} 조회수는 하루 한 번 적는 기록이 {period === '7d' ? 8 : 31}일치 쌓여야 나옵니다 (지금 {historyDays}일치). 그
          전엔 기록이 있는 채널만 위에 나옵니다.
        </div>
      )}

      {err ? (
        <Empty>불러오지 못했습니다 — {err}</Empty>
      ) : loaded && rows.length === 0 ? (
        <Empty>조건에 맞는 채널이 없습니다</Empty>
      ) : (
        <div className={'card-surface theme-fade overflow-hidden rounded-[22px] ' + (pending ? 'opacity-60' : '')}>
          <div className="hidden grid-cols-[52px_minmax(0,1.5fr)_120px_100px_64px_minmax(0,2fr)] gap-3 border-b px-4 py-2.5 text-[11.5px] font-bold text-[color:var(--text-faint)] lg:grid" style={{ borderColor: 'var(--border-subtle, var(--chip))' }}>
            <span>순위</span>
            <span>채널</span>
            <span className="text-right">{metricLabel}</span>
            <span>7일 추세</span>
            <span className="text-right">빈도</span>
            <span>터진 영상 / 최신</span>
          </div>
          {rows.map((r) => (
            <RankRow key={r.id} r={r} period={period} />
          ))}
          {hasMore && (
            <button onClick={more} disabled={pending} className="w-full py-3 text-[13px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-40">
              {pending ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function RankChange({ rank, prev }: { rank: number; prev: number | null }) {
  if (prev == null) return null;
  const d = prev - rank;
  if (d === 0) return <span className="text-[11px] font-bold text-[color:var(--text-faint)]">–</span>;
  return (
    <span className="num text-[11px] font-bold" style={{ color: d > 0 ? 'var(--red)' : 'var(--text-faint)' }} title={`어제 ${prev}위`}>
      {d > 0 ? `▲${short(d)}` : `▼${short(-d)}`}
    </span>
  );
}

function metricValue(r: RankingRow, period: RankPeriod): number | null {
  if (period === '7d') return r.weekViews;
  if (period === '30d') return r.monthViews;
  return r.dailyViews;
}

function RankRow({ r, period }: { r: RankingRow; period: RankPeriod }) {
  const v = metricValue(r, period);
  const delta = r.dailyViews != null && r.dailyViewsPrev != null ? r.dailyViews - r.dailyViewsPrev : null;
  const age = channelAge(r.createdAt);
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 gap-y-2 border-b px-4 py-3 last:border-0 lg:grid-cols-[52px_minmax(0,1.5fr)_120px_100px_64px_minmax(0,2fr)] lg:items-center" style={{ borderColor: 'var(--border-subtle, var(--chip))' }}>
      <div className="flex flex-col items-center">
        <span className="num text-[18px] font-extrabold leading-none">{r.rank}</span>
        <RankChange rank={r.rank} prev={r.prevRank} />
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <a href={`https://www.youtube.com/channel/${r.externalId}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
          {r.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 채널 썸네일
            <img src={r.thumbnailUrl} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" />
          ) : (
            <span className="block h-10 w-10 rounded-full" style={{ background: 'var(--chip)' }} />
          )}
        </a>
        <div className="min-w-0">
          <a
            href={`https://www.youtube.com/channel/${r.externalId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-[14px] font-extrabold hover:underline"
          >
            {r.name}
          </a>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {r.contentFormat && <Chip>{FORMAT_LABEL[r.contentFormat] ?? r.contentFormat}</Chip>}
            <Chip tone={r.watched ? 'brand' : 'plain'} title={r.watched ? '관심 목록' : undefined}>
              {r.folder}
            </Chip>
          </div>
          <div className="mt-0.5 truncate text-[11.5px] font-semibold text-[color:var(--text-faint)]">
            {r.subscriberCount != null && <>구독 {short(r.subscriberCount)}</>}
            {r.totalViews != null && <> · 조회 {short(r.totalViews)}</>}
            {age && <> · {age}</>}
          </div>
        </div>
      </div>

      <div className="col-start-2 flex items-center gap-4 lg:col-start-auto lg:contents">
        <div className="lg:text-right">
          <div className="num text-[16px] font-extrabold leading-tight">{v != null ? short(v) : '–'}</div>
          {period === '24h' && delta != null && delta !== 0 && (
            <div className="num text-[11.5px] font-bold" style={{ color: delta > 0 ? 'var(--red)' : 'var(--text-faint)' }}>
              {delta > 0 ? '▲' : '▼'} {short(Math.abs(delta))}
            </div>
          )}
        </div>
        <Spark values={r.spark} />
        <div className="num text-[13px] font-bold lg:text-right">
          {r.weeklyUploads != null ? (
            <>
              {r.weeklyUploads >= 10 ? Math.round(r.weeklyUploads) : r.weeklyUploads.toFixed(1).replace(/\.0$/, '')}
              <span className="text-[11px] font-semibold text-[color:var(--text-faint)]">/주</span>
            </>
          ) : r.lastUploadAt ? (
            <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">{ago(r.lastUploadAt)}</span>
          ) : (
            '–'
          )}
        </div>
      </div>

      <div className="col-start-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-start-auto">
        <MiniVideo label="터진" v={r.top} watched={r.watched} />
        <MiniVideo label="최신" v={r.latest} watched={r.watched} />
      </div>
    </div>
  );
}

function MiniVideo({ label, v, watched }: { label: string; v: VideoBrief | null; watched: boolean }) {
  if (!v) {
    return (
      <span className="flex items-center rounded-lg px-2 py-1.5 text-[11.5px] font-semibold text-[color:var(--text-faint)]" style={{ background: 'var(--chip)' }}>
        {label} · {watched ? '수집 중' : '새 영상이 올라오면 보여요'}
      </span>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <VideoThumb id={v.id} src={v.thumbnailUrl} size="sm" className="w-[72px]" />
      <div className="min-w-0">
        <div className="text-[10.5px] font-extrabold text-[color:var(--text-faint)]">{label}</div>
        <a
          href={v.isShorts ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-[12px] font-bold leading-snug hover:underline"
          title={v.title}
        >
          {v.title}
        </a>
        <div className="num text-[11px] font-semibold text-[color:var(--text-faint)]">
          {short(v.views)}회 · {ago(v.publishedAt)}
        </div>
      </div>
    </div>
  );
}
