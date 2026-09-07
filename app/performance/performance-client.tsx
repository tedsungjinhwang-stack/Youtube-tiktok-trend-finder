'use client';

import { useEffect, useMemo, useState } from 'react';
import { isoToKstLocal, kstLocalToISO } from '@/lib/kst';
import { channelHref } from '@/lib/channel-url';
import { platformStyle } from '@/lib/platform-style';

type Entry = {
  id: string;
  channelId: string;
  title: string;
  uploadedAt: string;
  state: 'public' | 'scheduled' | 'private';
  views: number | null;
  note: string | null;
};

type Row = {
  id: string;
  name: string;
  platform: string;
  category: string | null;
  profile: string | null;
  url: string | null;
  perfEntries: Entry[];
};

const PERIODS = [
  { days: 7, label: '7일' },
  { days: 28, label: '28일' },
  { days: 90, label: '90일' },
  { days: 0, label: '전체' },
];

const STATE_LABEL: Record<Entry['state'], string> = {
  public: '공개',
  scheduled: '예약',
  private: '비공개',
};

const nf = new Intl.NumberFormat('ko-KR');

/**
 * 채널 평균 대비 성적.
 * 표본이 없거나 아직 공개 전이면 판정하지 않는다 — 0회를 '부진' 으로 찍으면
 * 방금 올린 영상이 전부 빨갛게 나온다.
 */
function verdict(views: number | null, avg: number | null) {
  if (views === null || avg === null || avg === 0) return null;
  const ratio = views / avg;
  if (ratio >= 1.5) return { text: '히트', tone: 'green' as const, ratio };
  if (ratio >= 0.8) return { text: '보통', tone: 'neutral' as const, ratio };
  return { text: '부진', tone: 'red' as const, ratio };
}

/** 'YYYY-MM-DDTHH:mm' → 'MM.DD' */
const mmdd = (iso: string) => {
  const l = isoToKstLocal(iso);
  return `${l.slice(5, 7)}.${l.slice(8, 10)}`;
};

export function PerformanceClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [days, setDays] = useState(28);
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
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

  const cutoff = useMemo(() => (days === 0 ? 0 : Date.now() - days * 86_400_000), [days]);
  const inPeriod = (e: Entry) => new Date(e.uploadedAt).getTime() >= cutoff;

  const shown = selected ? rows.filter((r) => r.id === selected) : rows;
  const totalViews = rows
    .flatMap((r) => r.perfEntries)
    .filter(inPeriod)
    .reduce((s, e) => s + (e.views ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-5 xl:px-0 xl:pt-0">
      <div className="card-surface theme-fade mb-3 rounded-[24px] px-[22px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.04em]">실적</h1>
            <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
              {days === 0 ? '전체' : `${days}일`} 기준 ·{' '}
              <span className="num">{nf.format(totalViews)}</span> 조회
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
          </div>
        </div>

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
              className={
                'theme-fade h-7 rounded-[9px] px-2.5 text-[12.5px] font-bold ' +
                (selected === r.id ? 'text-brand-foreground' : 'text-muted-foreground')
              }
              style={{ background: selected === r.id ? 'var(--accent-solid)' : 'var(--chip)' }}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="surface-warn mb-3 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      {loading ? (
        <p className="card-surface rounded-[22px] py-14 text-center text-[14px] text-muted-foreground">
          불러오는 중…
        </p>
      ) : rows.length === 0 ? (
        <p className="card-surface rounded-[22px] py-14 text-center text-[14px] font-semibold text-muted-foreground">
          채널이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => (
            <ChannelBlock key={r.id} row={r} inPeriod={inPeriod} onChanged={load} />
          ))}
        </div>
      )}

      <p className="mt-3.5 px-1 text-[12.5px] font-semibold text-[color:var(--text-faint)]">
        조회수는 직접 입력합니다. 평균 대비·판정은 그 채널에 적힌 공개 영상들의 평균으로 계산합니다.
      </p>
    </div>
  );
}

function ChannelBlock({
  row,
  inPeriod,
  onChanged,
}: {
  row: Row;
  inPeriod: (e: Entry) => boolean;
  onChanged: () => void;
}) {
  const href = channelHref(row.platform, row.url);
  const ps = platformStyle(row.platform);
  const entries = row.perfEntries.filter(inPeriod);

  // 평균은 기간과 무관하게 그 채널에 적힌 공개 영상 전체로 낸다 —
  // 기간을 좁힐 때마다 기준이 흔들리면 판정을 비교할 수 없다.
  const published = row.perfEntries.filter((e) => e.state === 'public' && e.views !== null);
  const avg =
    published.length > 0
      ? Math.round(published.reduce((s, e) => s + (e.views ?? 0), 0) / published.length)
      : null;

  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: '', date: '', state: 'public', views: '' });

  const add = async () => {
    if (!f.date || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/v1/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: row.id,
          title: f.title,
          uploadedAt: kstLocalToISO(`${f.date}T00:00`),
          state: f.state,
          views: f.views === '' ? null : Number(f.views),
        }),
      });
      const j = await r.json();
      if (!j.success) {
        alert(j.error?.message ?? '추가 실패');
        return;
      }
      setF({ title: '', date: '', state: 'public', views: '' });
      setAdding(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    await fetch(`/api/v1/performance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm('이 줄을 삭제할까요?')) return;
    await fetch(`/api/v1/performance/${id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-[22px] py-3">
        <span
          className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-lg text-[11.5px] font-black"
          style={{ background: ps.chipBg, color: ps.dot }}
        >
          {ps.mark}
        </span>
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
          {entries.length}개 · 채널 평균 {avg === null ? '—' : `${nf.format(avg)}회`}
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="theme-fade h-7 shrink-0 rounded-[9px] px-2.5 text-[12.5px] font-bold text-foreground"
          style={{ background: 'var(--chip)' }}
        >
          {adding ? '취소' : '+ 줄 추가'}
        </button>
      </div>

      {adding && (
        <div className="flex flex-wrap gap-1.5 px-[22px] pb-3">
          <input
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            placeholder="제목"
            className="h-9 min-w-[200px] flex-1 rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2.5 text-[13px]"
          />
          <input
            type="date"
            value={f.date}
            onChange={(e) => setF({ ...f, date: e.target.value })}
            className="h-9 w-[140px] rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2 text-[12.5px]"
          />
          <select
            value={f.state}
            onChange={(e) => setF({ ...f, state: e.target.value })}
            className="h-9 w-[110px] rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2 text-[12.5px]"
          >
            <option value="public">공개</option>
            <option value="scheduled">예약</option>
            <option value="private">비공개</option>
          </select>
          <input
            type="number"
            value={f.views}
            onChange={(e) => setF({ ...f, views: e.target.value })}
            placeholder="조회수"
            className="num h-9 w-[110px] rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2 text-right text-[13px]"
          />
          <button
            onClick={add}
            disabled={!f.date || busy}
            className="h-9 rounded-[10px] bg-brand px-3.5 text-[13px] font-bold text-brand-foreground disabled:opacity-40"
          >
            추가
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="px-[22px] pb-5 text-[13px] font-semibold text-[color:var(--text-faint)]">
          이 기간에 적힌 영상이 없습니다. 「+ 줄 추가」로 넣으세요.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-[13px]">
            <thead className="subtle-surface text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-[color:var(--text-quaternary)]">
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="px-[22px] py-2 text-left">제목</th>
                <th className="w-[110px] px-3 py-2 text-left">업로드</th>
                <th className="w-[110px] px-3 py-2 text-left">공개 상태</th>
                <th className="w-[120px] px-3 py-2 text-right">누적 조회</th>
                <th className="w-[100px] px-3 py-2 text-right">평균 대비</th>
                <th className="w-[110px] px-[22px] py-2 text-right">판정</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const j = verdict(e.state === 'public' ? e.views : null, avg);
                return (
                  <tr
                    key={e.id}
                    className="group row-hover theme-fade"
                    style={{ borderBottom: '1px solid var(--hairline)' }}
                  >
                    <td className="max-w-0 px-[22px] py-1.5">
                      <input
                        defaultValue={e.title}
                        onBlur={(ev) =>
                          ev.target.value !== e.title && patch(e.id, { title: ev.target.value })
                        }
                        placeholder="제목"
                        className="w-full border-none bg-transparent py-1 font-semibold outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="date"
                        defaultValue={isoToKstLocal(e.uploadedAt).slice(0, 10)}
                        onChange={(ev) =>
                          ev.target.value &&
                          patch(e.id, { uploadedAt: kstLocalToISO(`${ev.target.value}T00:00`) })
                        }
                        className="num w-full border-none bg-transparent py-1 text-[12.5px] text-[color:var(--text-faint)] outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        defaultValue={e.state}
                        onChange={(ev) => patch(e.id, { state: ev.target.value })}
                        className="w-full rounded-md border-none bg-transparent py-1 text-[12.5px] font-bold outline-none"
                        style={{
                          color:
                            e.state === 'public'
                              ? 'var(--green)'
                              : e.state === 'scheduled'
                                ? 'var(--amber)'
                                : 'var(--text-faint)',
                        }}
                      >
                        <option value="public">{STATE_LABEL.public}</option>
                        <option value="scheduled">{STATE_LABEL.scheduled}</option>
                        <option value="private">{STATE_LABEL.private}</option>
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        defaultValue={e.views ?? ''}
                        onBlur={(ev) => {
                          const v = ev.target.value === '' ? null : Number(ev.target.value);
                          if (v !== e.views) patch(e.id, { views: v });
                        }}
                        placeholder="—"
                        className="num w-full border-none bg-transparent py-1 text-right font-semibold outline-none"
                      />
                    </td>
                    <td className="num px-3 py-1.5 text-right text-[color:var(--text-faint)]">
                      {j ? `${Math.round(j.ratio * 100)}%` : '—'}
                    </td>
                    <td className="px-[22px] py-1.5 text-right">
                      <span className="inline-flex items-center gap-1.5">
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
                        <button
                          onClick={() => remove(e.id)}
                          title="줄 삭제"
                          className="hover-action text-[12px] text-[color:var(--text-faint)] hover:text-[color:var(--red)]"
                        >
                          ✕
                        </button>
                      </span>
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
