'use client';

import { useEffect, useMemo, useState } from 'react';
import { kstShort } from '@/lib/kst';
import { channelHref } from '@/lib/channel-url';

type PerfVideo = {
  videoId: string;
  title: string;
  uploadedAt: string;
  publishedAt: string | null;
  state: 'public' | 'scheduled' | 'private' | 'unlisted';
  views: number | null;
  likes: number | null;
  comments: number | null;
};

type Row = {
  id: string;
  name: string;
  category: string | null;
  profile: string | null;
  url: string | null;
  connected: boolean;
  perf: {
    channelName: string;
    avgViews: number | null;
    videos: PerfVideo[];
    syncedAt: string;
  } | null;
  error: string | null;
};

const PERIODS = [
  { days: 7, label: '7일' },
  { days: 28, label: '28일' },
  { days: 90, label: '90일' },
];

const STATE_LABEL: Record<PerfVideo['state'], string> = {
  public: '공개',
  scheduled: '예약',
  private: '비공개',
  unlisted: '일부공개',
};

const nf = new Intl.NumberFormat('ko-KR');

/**
 * 채널 평균 대비 성적.
 * 평균 표본이 없거나 아직 공개 전이면 판정하지 않는다 — 0회를 '부진' 으로 찍으면
 * 방금 올린 영상이 전부 빨갛게 나온다.
 */
function verdict(views: number | null, avg: number | null) {
  if (views === null || avg === null || avg === 0) return null;
  const ratio = views / avg;
  if (ratio >= 1.5) return { text: '히트', tone: 'green' as const, ratio };
  if (ratio >= 0.8) return { text: '보통', tone: 'neutral' as const, ratio };
  return { text: '부진', tone: 'red' as const, ratio };
}

export function PerformanceClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(28);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/v1/performance', { cache: 'no-store' });
      const j = await r.json();
      if (j.success) {
        setRows(j.data ?? []);
        setErr(null);
      } else {
        setErr(j.error?.message ?? '불러오기 실패');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cutoff = useMemo(() => Date.now() - days * 86_400_000, [days]);

  /** 기간 필터는 화면에서만 — 다시 불러오지 않는다 (API 쿼터를 아낀다) */
  const inPeriod = (v: PerfVideo) => {
    const t = new Date(v.publishedAt ?? v.uploadedAt).getTime();
    return Number.isFinite(t) ? t >= cutoff : true;
  };

  const shown = selected ? rows.filter((r) => r.id === selected) : rows;
  const totalViews = rows
    .flatMap((r) => r.perf?.videos ?? [])
    .filter(inPeriod)
    .reduce((s, v) => s + (v.views ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-5 xl:px-0 xl:pt-0">
      {/* 헤더 */}
      <div className="card-surface theme-fade mb-3 rounded-[24px] px-[22px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.04em]">유튜브 실적</h1>
            <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
              {days}일 기준 · <span className="num">{nf.format(totalViews)}</span> 조회
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={
                  'theme-fade h-8 rounded-[10px] px-3 text-[13px] font-bold ' +
                  (days === p.days ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')
                }
                style={days === p.days ? { background: 'var(--chip)' } : undefined}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={load}
              disabled={loading}
              className="theme-fade ml-1 h-8 rounded-[10px] px-3 text-[13px] font-bold text-foreground disabled:opacity-50"
              style={{ background: 'var(--chip)' }}
            >
              {loading ? '조회 중…' : '지금 새로 조회'}
            </button>
          </div>
        </div>

        {/* 채널 칩 */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelected(null)}
            className={
              'theme-fade h-7 rounded-[9px] px-2.5 text-[12.5px] font-bold ' +
              (selected === null ? 'text-brand-foreground' : 'text-muted-foreground')
            }
            style={{ background: selected === null ? 'var(--accent-solid)' : 'var(--chip)' }}
          >
            전체 채널
          </button>
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              title={r.connected ? undefined : '유튜브 미연결'}
              className={
                'theme-fade h-7 rounded-[9px] px-2.5 text-[12.5px] font-bold ' +
                (selected === r.id ? 'text-brand-foreground' : 'text-muted-foreground') +
                (r.connected ? '' : ' opacity-50')
              }
              style={{ background: selected === r.id ? 'var(--accent-solid)' : 'var(--chip)' }}
            >
              {r.name}
              {!r.connected && ' (연결 안 됨)'}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="surface-warn mb-3 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      {loading && rows.length === 0 ? (
        <p className="card-surface rounded-[22px] py-14 text-center text-[14px] text-muted-foreground">
          불러오는 중…
        </p>
      ) : rows.length === 0 ? (
        <p className="card-surface rounded-[22px] py-14 text-center text-[14px] font-semibold text-muted-foreground">
          유튜브 채널이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => (
            <ChannelBlock key={r.id} row={r} inPeriod={inPeriod} />
          ))}
        </div>
      )}

      <p className="mt-3.5 px-1 text-[12.5px] font-semibold text-[color:var(--text-faint)]">
        조회수는 유튜브에서 그때그때 가져옵니다. 지속률은 YouTube Analytics 권한이 따로 필요해
        아직 없습니다.
      </p>
    </div>
  );
}

function ChannelBlock({
  row,
  inPeriod,
}: {
  row: Row;
  inPeriod: (v: PerfVideo) => boolean;
}) {
  const href = channelHref('YOUTUBE', row.url);
  const videos = (row.perf?.videos ?? []).filter(inPeriod);
  const avg = row.perf?.avgViews ?? null;

  return (
    <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[22px] py-3">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[15px] font-extrabold tracking-tight hover:text-brand hover:underline"
          >
            {row.name}
          </a>
        ) : (
          <span className="text-[15px] font-extrabold tracking-tight">{row.name}</span>
        )}
        {row.category && (
          <span className="text-[12.5px] font-semibold text-[color:var(--text-faint)]">
            {row.category}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-[12.5px] font-semibold text-[color:var(--text-faint)]">
          {row.connected
            ? `최신 ${videos.length}개 · 채널 평균 ${avg === null ? '—' : `${nf.format(avg)}회`}${
                row.perf ? ` · 동기화 ${kstShort(row.perf.syncedAt)}` : ''
              }`
            : '유튜브 미연결'}
        </span>
      </div>

      {!row.connected ? (
        <p className="px-[22px] pb-5 text-[13px] font-semibold text-[color:var(--text-faint)]">
          유튜브 대시보드에서 이 채널을 연결하면 실적이 여기 표시됩니다.
        </p>
      ) : row.error ? (
        <p className="px-[22px] pb-5 text-[13px] font-semibold" style={{ color: 'var(--red)' }}>
          {row.error}
        </p>
      ) : videos.length === 0 ? (
        <p className="px-[22px] pb-5 text-[13px] font-semibold text-[color:var(--text-faint)]">
          이 기간에 올린 영상이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="subtle-surface text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[color:var(--text-quaternary)]">
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="px-[22px] py-2 text-left">제목</th>
                <th className="w-[110px] px-3 py-2 text-left">업로드</th>
                <th className="w-[150px] px-3 py-2 text-left">공개 상태</th>
                <th className="w-[110px] px-3 py-2 text-right">누적 조회</th>
                <th className="w-[110px] px-3 py-2 text-right">평균 대비</th>
                <th className="w-[90px] px-[22px] py-2 text-right">판정</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => {
                const j = verdict(v.views, avg);
                return (
                  <tr
                    key={v.videoId}
                    className="row-hover theme-fade"
                    style={{ borderBottom: '1px solid var(--hairline)' }}
                  >
                    <td className="max-w-0 px-[22px] py-2.5">
                      <a
                        href={`https://www.youtube.com/watch?v=${v.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-semibold hover:text-brand hover:underline"
                        title={v.title}
                      >
                        {v.title || '(제목 없음)'}
                      </a>
                    </td>
                    <td className="num px-3 py-2.5 text-[color:var(--text-faint)]">
                      {v.uploadedAt ? kstShort(v.uploadedAt).slice(0, 5) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[11.5px] font-bold"
                        style={
                          v.state === 'public'
                            ? { background: 'var(--green-bg)', color: 'var(--green)' }
                            : v.state === 'scheduled'
                              ? { background: 'var(--amber-bg)', color: 'var(--amber)' }
                              : { background: 'var(--chip)', color: 'var(--text-faint)' }
                        }
                      >
                        {STATE_LABEL[v.state]}
                        {v.state === 'scheduled' && v.publishedAt
                          ? ` ${kstShort(v.publishedAt)}`
                          : ''}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-right font-semibold">
                      {v.views === null ? '—' : nf.format(v.views)}
                    </td>
                    <td className="num px-3 py-2.5 text-right text-[color:var(--text-faint)]">
                      {j ? `${Math.round(j.ratio * 100)}%` : '—'}
                    </td>
                    <td className="px-[22px] py-2.5 text-right">
                      {j ? (
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[11.5px] font-bold"
                          style={
                            j.tone === 'green'
                              ? { background: 'var(--green-bg)', color: 'var(--green)' }
                              : j.tone === 'red'
                                ? { background: 'var(--red-bg)', color: 'var(--red)' }
                                : { background: 'var(--chip)', color: 'var(--text-faint)' }
                          }
                        >
                          {j.text}
                        </span>
                      ) : (
                        <span className="text-[color:var(--text-faint)]">대기</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
