'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { isoToKstLocal, kstDDay, kstShort, kstTodayLabel } from '@/lib/kst';
import { platformStyle } from '@/lib/platform-style';
import {
  DASHBOARD_GROUPS,
  GROUP_LABEL,
  GROUP_PATH,
  GROUP_UNIT,
  defaultGroupForPlatform,
  type DashboardGroup,
} from '@/lib/todoist-groups';
import { RunwayGrid, nextDays, runwayDays, type RunwayChannel } from './runway';

type Video = {
  id: string;
  title: string;
  scheduledAt: string;
  publishedUrl?: string | null;
};

type Channel = {
  id: string;
  name: string;
  platform: string;
  category: string | null;
  isActive: boolean;
  todoistGroup?: string | null;
  videos: Video[];
};

type Row = {
  ch: Channel;
  group: DashboardGroup;
  last: Video | null;
  today: Video[];
  published: Video | null;
  dday: number | null;
  runway: number;
};

const GROUP_ACCENT: Record<DashboardGroup, string> = {
  youtube: '#E0685F',
  shopping: '#57B37E',
  threads: '#C9CCD1',
};

export function OverviewClient() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/my-schedule/channels', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setChannels((j.data ?? []).filter((c: Channel) => c.isActive));
        else setErr(j.error?.message ?? '불러오기 실패');
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(() => nextDays(7), []);

  const rows: Row[] = useMemo(
    () =>
      channels.map((ch) => {
        const desc = [...ch.videos].sort(
          (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
        );
        const last = desc[0] ?? null;
        const group = (ch.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(ch.platform);
        const rc: RunwayChannel = {
          id: ch.id,
          name: ch.name,
          platform: ch.platform,
          group,
          videos: ch.videos,
        };
        return {
          ch,
          group,
          last,
          today: ch.videos
            .filter((v) => kstDDay(v.scheduledAt) === 0)
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
          published: desc.find((v) => !!v.publishedUrl) ?? null,
          dday: last ? kstDDay(last.scheduledAt) : null,
          runway: runwayDays(rc, days),
        };
      }),
    [channels, days]
  );

  if (loading) {
    return <div className="p-8 text-[15px] text-muted-foreground">로딩 중…</div>;
  }

  const todayItems = rows
    .flatMap((r) => r.today.map((v) => ({ r, v })))
    .sort((a, b) => new Date(a.v.scheduledAt).getTime() - new Date(b.v.scheduledAt).getTime());
  const critical = rows.filter((r) => r.runway === 0);
  const runwayChannels: RunwayChannel[] = rows.map((r) => ({
    id: r.ch.id,
    name: r.ch.name,
    platform: r.ch.platform,
    group: r.group,
    videos: r.ch.videos,
  }));

  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-6">
      {err && (
        <div className="surface-warn mb-4 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      {/* 헤더 — 오늘 처리할 것만 크게 */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-[color:var(--text-quaternary)]">
            {kstTodayLabel()} KST
          </p>
          <h1 className="mt-1 text-[26px] font-extrabold tracking-[-0.03em]">
            오늘 {todayItems.length}건 발행
            {critical.length > 0 && (
              <span className="ml-2 text-[#D9A55C]">· {critical.length}곳 예약 비었음</span>
            )}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {DASHBOARD_GROUPS.map((g) => {
            const n = rows.filter((r) => r.group === g).length;
            const risk = rows.filter((r) => r.group === g && r.runway === 0).length;
            return (
              <Link
                key={g}
                href={GROUP_PATH[g]}
                className="flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-[12.5px] font-bold hover:border-[color:var(--border-hover)]"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: GROUP_ACCENT[g] }}
                />
                {GROUP_LABEL[g]}
                <span className="num text-[color:var(--text-faint)]">{n}</span>
                {risk > 0 && (
                  <span className="num rounded bg-[rgba(217,165,92,0.15)] px-1.5 text-[11px] text-[#D9A55C]">
                    {risk}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </header>

      {/* 오늘 할 일 — 가장 위, 카드 줄 */}
      <section className="mb-5">
        <SectionLabel>오늘 발행</SectionLabel>
        {todayItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--border-dashed)] px-4 py-8 text-center text-[13px] text-muted-foreground">
            오늘 예정된 발행이 없습니다
          </div>
        ) : (
          <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {todayItems.map(({ r, v }) => {
              const ps = platformStyle(r.ch.platform);
              return (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3"
                >
                  <span
                    className="num shrink-0 rounded-lg px-2 py-1.5 text-[14px] font-extrabold"
                    style={{ background: ps.chipBg, color: ps.dot }}
                  >
                    {isoToKstLocal(v.scheduledAt).slice(11, 16)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{r.ch.name}</span>
                    <span className="block truncate text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                      {v.title || '제목 없음'}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 7일 런웨이 — 핵심 시각화 */}
      <section className="mb-5 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionLabel inline>7일 예약 런웨이</SectionLabel>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[color:var(--text-faint)]">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-5 rounded"
                style={{
                  background: 'rgba(111,199,177,0.18)',
                  boxShadow: 'inset 0 0 0 1px rgba(111,199,177,0.25)',
                }}
              />
              예약됨
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-5 rounded"
                style={{ boxShadow: 'inset 0 0 0 1px var(--border-row)' }}
              />
              비어있음
            </span>
            <span>· 우측 숫자 = 연속 예약 일수</span>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            등록된 채널이 없습니다
          </p>
        ) : (
          <RunwayGrid channels={runwayChannels} />
        )}
      </section>

      {/* 그룹별 상세 — 필요한 것만 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {DASHBOARD_GROUPS.map((g) => (
          <GroupCard key={g} group={g} rows={rows.filter((r) => r.group === g)} />
        ))}
      </div>
    </div>
  );
}

/* ─────────── 조각 ─────────── */

function SectionLabel({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <h2
      className={
        'text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-[color:var(--text-quaternary)] ' +
        (inline ? '' : 'mb-2')
      }
    >
      {children}
    </h2>
  );
}

function GroupCard({ group, rows }: { group: DashboardGroup; rows: Row[] }) {
  const unit = GROUP_UNIT[group];
  const accent = GROUP_ACCENT[group];
  const need = rows.filter((r) => r.runway === 0);
  const published = rows.filter((r) => r.published);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div
        className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
        style={{ background: `linear-gradient(90deg, ${accent}12, transparent 65%)` }}
      >
        <Link href={GROUP_PATH[group]} className="group flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
          <span className="truncate text-[14px] font-extrabold tracking-tight group-hover:text-brand">
            {GROUP_LABEL[group]}
          </span>
          <span className="num shrink-0 text-[12px] font-bold text-[color:var(--text-faint)]">
            {rows.length}
          </span>
        </Link>
        <Link
          href={GROUP_PATH[group]}
          className="shrink-0 text-[11.5px] font-bold text-muted-foreground hover:text-foreground"
        >
          관리 →
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
          등록된 {unit}이 없습니다
        </p>
      ) : (
        <div className="p-4">
          {/* 런웨이 분포 막대 */}
          <RunwayBar rows={rows} />

          {need.length > 0 && (
            <div className="mt-3.5">
              <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#D9A55C]">
                예약 비었음 {need.length}
              </p>
              <ul className="flex flex-col gap-1">
                {need.map((r) => (
                  <li key={r.ch.id} className="flex items-center gap-2">
                    <Mark platform={r.ch.platform} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">
                      {r.ch.name}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-[color:var(--text-faint)]">
                      {r.last ? kstShort(r.last.scheduledAt).slice(0, 5) : '없음'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {published.length > 0 && (
            <div className="mt-3.5 border-t border-[color:var(--border-row)] pt-3">
              <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[color:var(--text-quaternary)]">
                최근 발행
              </p>
              <ul className="flex flex-col gap-1">
                {published.map((r) => (
                  <li key={r.ch.id} className="flex items-center gap-2">
                    <Mark platform={r.ch.platform} />
                    <a
                      href={r.published!.publishedUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-[12px] font-semibold text-brand hover:underline"
                    >
                      {r.published!.title || r.ch.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** 런웨이 분포를 한 줄 막대로 — 0일(위험) / 1~2일 / 3일+ */
function RunwayBar({ rows }: { rows: Row[] }) {
  const zero = rows.filter((r) => r.runway === 0).length;
  const low = rows.filter((r) => r.runway >= 1 && r.runway <= 2).length;
  const ok = rows.filter((r) => r.runway >= 3).length;
  const total = rows.length || 1;
  const seg = [
    { n: zero, color: '#D9A55C', label: '비었음' },
    { n: low, color: '#C0A177', label: '1~2일' },
    { n: ok, color: '#6FC7B1', label: '3일+' },
  ].filter((s) => s.n > 0);

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[color:var(--surface-chip)]">
        {seg.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.n / total) * 100}%`, background: s.color }}
            title={`${s.label} ${s.n}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
        {seg.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5" style={{ color: s.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="num">{s.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Mark({ platform }: { platform: string }) {
  const ps = platformStyle(platform);
  return (
    <span
      className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded text-[10.5px] font-black"
      style={{ background: ps.chipBg, color: ps.dot }}
      title={ps.label}
    >
      {ps.mark}
    </span>
  );
}
