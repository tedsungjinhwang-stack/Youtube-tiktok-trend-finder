'use client';

import { useEffect, useState, useTransition } from 'react';
import { Pill } from '../../trends/ui';
import { pastHitsAction } from '../actions';
import type { PastHitRow, PastQuery, PastResult } from '@/lib/radar/queries';
import { Empty, VideoThumb, short } from './parts';

/**
 * 과거 트래픽 — 업로드가 60일 넘게 끊겨 정리한 채널의 100만+ 영상.
 * 터졌던 소재는 또 터지니까, 예전에 뭐가 먹혔는지 찾아보는 곳.
 */

const SORTS: { key: PastQuery['sort']; label: string }[] = [
  { key: 'views', label: '조회수' },
  { key: 'recent', label: '최근 게시' },
  { key: 'old', label: '오래된' },
];

function ym(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function PastView() {
  const [format, setFormat] = useState<PastQuery['format']>('shorts');
  const [sort, setSort] = useState<PastQuery['sort']>('views');
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<PastResult | null>(null);
  const [rows, setRows] = useState<PastHitRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const params = { format, sort, folder, q: query };

  useEffect(() => {
    let alive = true;
    start(async () => {
      try {
        const r = await pastHitsAction({ ...params, offset: 0 });
        if (!alive) return;
        setData(r);
        setRows(r.rows);
        setErr(null);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 조건이 바뀔 때만
  }, [format, sort, folder, query]);

  const more = () =>
    start(async () => {
      const r = await pastHitsAction({ ...params, offset: rows.length });
      setRows((prev) => [...prev, ...r.rows]);
      setData((d) => (d ? { ...d, hasMore: r.hasMore } : r));
    });

  const vertical = format !== 'long';

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">과거 트래픽</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            업로드가 60일 넘게 끊긴 채널의 100만+ 영상 — 터졌던 소재는 또 터진다
          </p>
        </div>
        {data && (
          <p className="text-[12px] font-semibold text-[color:var(--text-faint)]">
            정리한 채널 <span className="num">{data.archivedChannels.toLocaleString('ko-KR')}</span>곳 · 남은 정리 대상{' '}
            <span className="num">{data.pendingChannels.toLocaleString('ko-KR')}</span>곳 (남는 유튜브 할당량으로 매일 조금씩)
          </p>
        )}
      </div>

      <div className="card-surface theme-fade mb-3 space-y-2.5 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill strong active={format === 'shorts'} onClick={() => setFormat('shorts')}>
            쇼츠
          </Pill>
          <Pill strong active={format === 'long'} onClick={() => setFormat('long')}>
            롱폼
          </Pill>
          <Pill strong active={format === 'all'} onClick={() => setFormat('all')}>
            전체
          </Pill>
          <span className="mx-1 h-4 w-px" style={{ background: 'var(--chip)' }} />
          {SORTS.map((s) => (
            <Pill key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
              {s.label}
            </Pill>
          ))}
          <form
            className="ml-auto"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q);
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="제목·채널 찾기"
              className="h-7 w-[180px] rounded-[9px] border-0 px-2.5 text-[12.5px] font-semibold outline-none"
              style={{ background: 'var(--chip)' }}
            />
          </form>
        </div>
        {data && data.folders.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Pill active={!folder} onClick={() => setFolder(null)}>
              전체
            </Pill>
            {data.folders.map((f) => (
              <Pill key={f.name} active={folder === f.name} onClick={() => setFolder(folder === f.name ? null : f.name)}>
                {f.name} <span className="num ml-0.5 opacity-70">{f.count.toLocaleString('ko-KR')}</span>
              </Pill>
            ))}
          </div>
        )}
      </div>

      {err ? (
        <Empty>불러오지 못했습니다 — {err}</Empty>
      ) : !data ? (
        <Empty>불러오는 중…</Empty>
      ) : rows.length === 0 ? (
        <Empty>
          {data.archivedChannels === 0
            ? '아직 정리한 채널이 없습니다. 수집기가 남는 유튜브 할당량으로 끊긴 채널을 하나씩 정리하면서 100만+ 영상을 여기에 쌓습니다.'
            : '조건에 맞는 영상이 없습니다'}
        </Empty>
      ) : (
        <>
          <p className="mb-2 px-1 text-[12px] font-semibold text-[color:var(--text-faint)]">
            <span className="num">{data.total.toLocaleString('ko-KR')}</span>개
          </p>
          <div
            className={
              'grid gap-2.5 ' +
              (vertical ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4') +
              (pending ? ' opacity-60' : '')
            }
          >
            {rows.map((r) => (
              <div key={r.id} className="card-surface theme-fade flex flex-col overflow-hidden rounded-[16px]">
                <VideoThumb id={r.id} src={r.thumbnailUrl} vertical={r.isShorts && vertical} className="w-full rounded-none">
                  <span className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0) 45%)' }} />
                  <span className="num absolute bottom-2 left-2.5 text-[18px] font-extrabold leading-none text-white">{short(r.views)}</span>
                </VideoThumb>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <a
                    href={r.isShorts ? `https://www.youtube.com/shorts/${r.id}` : `https://www.youtube.com/watch?v=${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 text-[12.5px] font-bold leading-snug hover:underline"
                    title={r.title}
                  >
                    {r.title}
                  </a>
                  <a
                    href={`https://www.youtube.com/channel/${r.channelExternalId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[11.5px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {r.channelName ?? r.channelExternalId}
                  </a>
                  <div className="mt-auto flex flex-wrap gap-x-2 pt-0.5 text-[11px] font-semibold text-[color:var(--text-faint)]">
                    <span className="num">{ym(r.publishedAt)}</span>
                    {r.folder && <span className="truncate">{r.folder}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {data.hasMore && (
            <button
              onClick={more}
              disabled={pending}
              className="mt-3 w-full rounded-xl py-3 text-[13px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-40"
              style={{ background: 'var(--chip)' }}
            >
              {pending ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </>
      )}
    </>
  );
}
