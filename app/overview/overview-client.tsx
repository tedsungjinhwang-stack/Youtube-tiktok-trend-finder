'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { kstDDay, kstShort, kstTodayDate, kstTodayLabel } from '@/lib/kst';
import { platformStyle } from '@/lib/platform-style';
import {
  DASHBOARD_GROUPS,
  GROUP_LABEL,
  GROUP_PATH,
  GROUP_UNIT,
  defaultGroupForPlatform,
  type DashboardGroup,
} from '@/lib/todoist-groups';

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
  /** 마지막(가장 미래) 예약 */
  last: Video | null;
  /** 오늘 발행 예정 */
  today: Video[];
  /** 발행 링크가 있는 최근 글 */
  recentPublished: Video | null;
  dday: number | null;
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

  const rows: Row[] = useMemo(() => {
    const today = kstTodayDate();
    return channels.map((ch) => {
      const sorted = [...ch.videos].sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      );
      const last = sorted[0] ?? null;
      const todays = ch.videos.filter((v) => kstDDay(v.scheduledAt) === 0);
      const published = sorted.find((v) => !!v.publishedUrl) ?? null;
      void today;
      return {
        ch,
        group: (ch.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(ch.platform),
        last,
        today: todays.sort(
          (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
        ),
        recentPublished: published,
        dday: last ? kstDDay(last.scheduledAt) : null,
      };
    });
  }, [channels]);

  const todayRows = rows.filter((r) => r.today.length > 0);
  const needUpload = rows.filter((r) => r.dday === null || r.dday <= 0);
  const soon = rows.filter((r) => r.dday !== null && r.dday >= 1 && r.dday <= 1);
  const relaxed = rows.filter((r) => r.dday !== null && r.dday >= 2);

  if (loading) {
    return <div className="p-8 text-[15px] text-muted-foreground">로딩 중…</div>;
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-6">
      {err && (
        <div className="surface-warn mb-4 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">전체 현황</h1>
          <p className="mt-1.5 text-[13px] font-semibold text-muted-foreground">
            오늘 {kstTodayLabel()} KST — 오늘 발행할 것 · 예약 소진 임박 · 여유 현황
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DASHBOARD_GROUPS.map((g) => (
            <Link
              key={g}
              href={GROUP_PATH[g]}
              className="h-9 rounded-lg border border-input px-3 pt-[7px] text-[13px] font-bold text-muted-foreground hover:border-[color:var(--border-hover)] hover:text-foreground"
            >
              {GROUP_LABEL[g]} 대시보드
            </Link>
          ))}
        </div>
      </div>

      {/* KPI 4장 */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          warn
          label="오늘 발행 예정"
          value={todayRows.reduce((n, r) => n + r.today.length, 0)}
          sub={todayRows.length > 0 ? `${todayRows.length}개 채널` : '없음'}
        />
        <Kpi
          warn
          label="업로드 필요 (예약 없음/지남)"
          value={needUpload.length}
          sub={needUpload.length > 0 ? needUpload.map((r) => r.ch.name).slice(0, 4).join(' · ') : '없음'}
        />
        <Kpi
          label="소진 임박 (D-1)"
          value={soon.length}
          sub={soon.length > 0 ? soon.map((r) => r.ch.name).slice(0, 4).join(' · ') : '없음'}
        />
        <Kpi
          label="여유 (D-2 이상)"
          value={relaxed.length}
          sub={relaxed.length > 0 ? relaxed.map((r) => r.ch.name).slice(0, 4).join(' · ') : '없음'}
        />
      </div>

      {/* 오늘 발행할 것 */}
      <Section title="오늘 발행할 것" count={todayRows.reduce((n, r) => n + r.today.length, 0)}>
        {todayRows.length === 0 ? (
          <Empty text="오늘 예정된 발행이 없습니다." />
        ) : (
          <ul className="divide-y divide-[color:var(--border-row)]">
            {todayRows
              .flatMap((r) => r.today.map((v) => ({ r, v })))
              .sort((a, b) => new Date(a.v.scheduledAt).getTime() - new Date(b.v.scheduledAt).getTime())
              .map(({ r, v }) => (
                <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <PlatformMark platform={r.ch.platform} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{r.ch.name}</span>
                    <span className="block truncate text-[12px] font-semibold text-[color:var(--text-faint)]">
                      {v.title || '제목 없음'}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[14px] font-extrabold">
                    {kstShort(v.scheduledAt).slice(-5)}
                  </span>
                  <GroupChip group={r.group} />
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* 업로드 필요 */}
      <Section title="업로드 필요" count={needUpload.length} tone="warn">
        {needUpload.length === 0 ? (
          <Empty text="모든 채널에 미래 예약이 있습니다." />
        ) : (
          <ul className="divide-y divide-[color:var(--border-row)]">
            {needUpload
              .sort((a, b) => (a.dday ?? -999) - (b.dday ?? -999))
              .map((r) => (
                <li key={r.ch.id} className="flex items-center gap-3 px-4 py-3">
                  <PlatformMark platform={r.ch.platform} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{r.ch.name}</span>
                    <span className="block truncate text-[12px] font-semibold text-[color:var(--text-faint)]">
                      {r.last ? `마지막 예약 ${kstShort(r.last.scheduledAt)}` : '예약된 영상 없음'}
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-md px-2 py-1 text-[11.5px] font-extrabold"
                    style={{ background: 'rgba(217,165,92,0.15)', color: '#D9A55C' }}
                  >
                    {r.dday === null ? '예약 없음' : r.dday === 0 ? 'D-DAY' : '지남'}
                  </span>
                  <GroupChip group={r.group} />
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* 예약 현황 (임박한 순) */}
      <Section title="예약 현황" count={rows.length} hint="임박한 순">
        <div className="grid gap-2.5 p-4 [grid-template-columns:repeat(auto-fill,minmax(268px,1fr))]">
          {[...rows]
            .sort((a, b) => (a.dday ?? -999) - (b.dday ?? -999))
            .map((r) => {
              const urgent = r.dday === null || r.dday <= 1;
              return (
                <div
                  key={r.ch.id}
                  className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
                  style={{
                    background: urgent ? '#221F19' : '#20242A',
                    borderColor: urgent ? '#3A3324' : '#2B3036',
                  }}
                >
                  <PlatformMark platform={r.ch.platform} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{r.ch.name}</span>
                    <span className="block truncate text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                      {r.last ? `마지막 예약 ${kstShort(r.last.scheduledAt)}` : '예약 없음'}
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-md px-2 py-1 text-[11.5px] font-extrabold"
                    style={
                      urgent
                        ? { background: 'rgba(217,165,92,0.15)', color: '#D9A55C' }
                        : { background: '#252A2F', color: '#8A939C' }
                    }
                  >
                    {r.dday === null ? '없음' : r.dday === 0 ? 'D-DAY' : r.dday < 0 ? '지남' : `D-${r.dday}`}
                  </span>
                </div>
              );
            })}
        </div>
      </Section>

      {/* 최근 발행된 글 (스레드 등 — publishedUrl 입력된 것) */}
      <Section
        title="최근 발행된 글"
        count={rows.filter((r) => r.recentPublished).length}
        hint="발행 링크가 입력된 항목"
      >
        {rows.filter((r) => r.recentPublished).length === 0 ? (
          <Empty text="발행 링크가 입력된 항목이 없습니다. 대시보드에서 예약 행에 링크를 넣으면 여기 표시됩니다." />
        ) : (
          <ul className="divide-y divide-[color:var(--border-row)]">
            {rows
              .filter((r) => r.recentPublished)
              .sort(
                (a, b) =>
                  new Date(b.recentPublished!.scheduledAt).getTime() -
                  new Date(a.recentPublished!.scheduledAt).getTime()
              )
              .map((r) => (
                <li key={r.ch.id} className="flex items-center gap-3 px-4 py-3">
                  <PlatformMark platform={r.ch.platform} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold">{r.ch.name}</span>
                    <a
                      href={r.recentPublished!.publishedUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[12px] font-semibold text-brand hover:underline"
                    >
                      {r.recentPublished!.title || r.recentPublished!.publishedUrl}
                    </a>
                  </span>
                  <span className="num shrink-0 text-[12px] font-semibold text-[color:var(--text-faint)]">
                    {kstShort(r.recentPublished!.scheduledAt)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ─────────── 작은 조각들 ─────────── */

function Kpi({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: number;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div className={warn ? 'surface-warn rounded-2xl border p-4' : 'rounded-2xl border border-border bg-card p-4'}>
      <div className={'text-[12.5px] font-bold ' + (warn ? 'text-[#D7C6A6]' : 'text-muted-foreground')}>
        {label}
      </div>
      <div
        className={
          'mt-1.5 num text-[29px] font-extrabold leading-none tracking-tight ' +
          (warn ? 'text-[#D9A55C]' : '')
        }
      >
        {value}
      </div>
      <div
        className={
          'mt-2 line-clamp-2 text-[12px] font-semibold ' +
          (warn ? 'text-[#B09A76]' : 'text-[color:var(--text-faint)]')
        }
      >
        {sub}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  hint,
  tone,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  tone?: 'warn';
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-[14px] font-extrabold tracking-tight">
          {title}
          <span
            className="rounded-md px-1.5 py-0.5 text-[11.5px] font-bold"
            style={
              tone === 'warn'
                ? { background: 'rgba(217,165,92,0.15)', color: '#D9A55C' }
                : { background: '#252A2F', color: '#8A939C' }
            }
          >
            {count}
          </span>
        </h2>
        {hint && (
          <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">{text}</p>;
}

function PlatformMark({ platform }: { platform: string }) {
  const ps = platformStyle(platform);
  return (
    <span
      className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-[12px] font-black"
      style={{ background: ps.chipBg, color: ps.dot }}
      title={ps.label}
    >
      {ps.mark}
    </span>
  );
}

function GroupChip({ group }: { group: DashboardGroup }) {
  return (
    <Link
      href={GROUP_PATH[group]}
      className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[11px] font-bold text-[color:var(--text-quaternary)] hover:text-foreground"
      title={`${GROUP_LABEL[group]} 대시보드로 (${GROUP_UNIT[group]} 관리)`}
    >
      {GROUP_LABEL[group]}
    </Link>
  );
}
