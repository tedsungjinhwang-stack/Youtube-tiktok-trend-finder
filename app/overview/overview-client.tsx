'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { kstDDay, kstShort, kstTodayLabel } from '@/lib/kst';
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
  last: Video | null;
  today: Video[];
  published: Video | null;
  dday: number | null;
};

/** 그룹 헤더 악센트 색 (대표 플랫폼 색) */
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

  const rows: Row[] = useMemo(
    () =>
      channels.map((ch) => {
        const desc = [...ch.videos].sort(
          (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
        );
        const last = desc[0] ?? null;
        return {
          ch,
          group: (ch.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(ch.platform),
          last,
          today: ch.videos
            .filter((v) => kstDDay(v.scheduledAt) === 0)
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
          published: desc.find((v) => !!v.publishedUrl) ?? null,
          dday: last ? kstDDay(last.scheduledAt) : null,
        };
      }),
    [channels]
  );

  if (loading) {
    return <div className="p-8 text-[15px] text-muted-foreground">로딩 중…</div>;
  }

  const totalToday = rows.reduce((n, r) => n + r.today.length, 0);
  const totalNeed = rows.filter((r) => r.dday === null || r.dday <= 0).length;

  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-6">
      {err && (
        <div className="surface-warn mb-4 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      {/* 페이지 헤더 */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">전체 현황</h1>
          <p className="mt-1.5 text-[13px] font-semibold text-muted-foreground">
            {kstTodayLabel()} KST
          </p>
        </div>
        <div className="flex items-center gap-5">
          <HeadStat label="오늘 발행" value={totalToday} />
          <HeadStat label="업로드 필요" value={totalNeed} warn={totalNeed > 0} />
          <HeadStat label="전체" value={rows.length} muted />
        </div>
      </div>

      {/* 그룹 3열 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {DASHBOARD_GROUPS.map((g) => (
          <GroupPanel key={g} group={g} rows={rows.filter((r) => r.group === g)} />
        ))}
      </div>
    </div>
  );
}

/* ─────────── 그룹 패널 ─────────── */

function GroupPanel({ group, rows }: { group: DashboardGroup; rows: Row[] }) {
  const unit = GROUP_UNIT[group];
  const accent = GROUP_ACCENT[group];

  const today = rows.flatMap((r) => r.today.map((v) => ({ r, v })));
  const need = rows.filter((r) => r.dday === null || r.dday <= 0);
  const soon = rows.filter((r) => r.dday === 1);
  const relaxed = rows.filter((r) => r.dday !== null && r.dday >= 2);
  const published = rows.filter((r) => r.published);

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
        style={{ background: `linear-gradient(90deg, ${accent}14, transparent 60%)` }}
      >
        <Link href={GROUP_PATH[group]} className="group flex items-center gap-2 min-w-0">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
          <span className="truncate text-[15px] font-extrabold tracking-tight group-hover:text-brand">
            {GROUP_LABEL[group]}
          </span>
          <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-bold text-[color:var(--text-quaternary)]">
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
        <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
          등록된 {unit}이 없습니다
        </p>
      ) : (
        <>
          {/* 요약 3칸 */}
          <div className="grid grid-cols-3 divide-x divide-[color:var(--border-row)] border-b border-border">
            <MiniStat label="오늘" value={today.length} tone={today.length > 0 ? 'brand' : 'plain'} />
            <MiniStat label="필요" value={need.length} tone={need.length > 0 ? 'warn' : 'plain'} />
            <MiniStat label="여유" value={relaxed.length} tone="plain" />
          </div>

          {/* 오늘 발행 */}
          {today.length > 0 && (
            <Block title="오늘 발행">
              {today
                .sort(
                  (a, b) =>
                    new Date(a.v.scheduledAt).getTime() - new Date(b.v.scheduledAt).getTime()
                )
                .map(({ r, v }) => (
                  <Item
                    key={v.id}
                    platform={r.ch.platform}
                    name={r.ch.name}
                    sub={v.title || '제목 없음'}
                    right={
                      <span className="num text-[13px] font-extrabold text-brand">
                        {kstShort(v.scheduledAt).slice(-5)}
                      </span>
                    }
                  />
                ))}
            </Block>
          )}

          {/* 업로드 필요 */}
          {need.length > 0 && (
            <Block title="업로드 필요" tone="warn">
              {need
                .sort((a, b) => (a.dday ?? -999) - (b.dday ?? -999))
                .map((r) => (
                  <Item
                    key={r.ch.id}
                    platform={r.ch.platform}
                    name={r.ch.name}
                    sub={r.last ? `마지막 ${kstShort(r.last.scheduledAt)}` : '예약 없음'}
                    right={
                      <Tag warn>
                        {r.dday === null ? '없음' : r.dday === 0 ? 'D-DAY' : '지남'}
                      </Tag>
                    }
                  />
                ))}
            </Block>
          )}

          {/* 소진 임박 */}
          {soon.length > 0 && (
            <Block title="소진 임박 (D-1)">
              {soon.map((r) => (
                <Item
                  key={r.ch.id}
                  platform={r.ch.platform}
                  name={r.ch.name}
                  sub={r.last ? `마지막 ${kstShort(r.last.scheduledAt)}` : ''}
                  right={<Tag>D-1</Tag>}
                />
              ))}
            </Block>
          )}

          {/* 여유 */}
          {relaxed.length > 0 && (
            <Block title="여유" collapsedHint={`${relaxed.length}${unit}`}>
              {relaxed
                .sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0))
                .map((r) => (
                  <Item
                    key={r.ch.id}
                    platform={r.ch.platform}
                    name={r.ch.name}
                    sub={r.last ? `마지막 ${kstShort(r.last.scheduledAt)}` : ''}
                    right={<Tag muted>D-{r.dday}</Tag>}
                  />
                ))}
            </Block>
          )}

          {/* 최근 발행된 글 */}
          {published.length > 0 && (
            <Block title="최근 발행">
              {published.map((r) => (
                <li key={r.ch.id} className="flex items-center gap-2.5 px-4 py-2">
                  <Mark platform={r.ch.platform} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold">{r.ch.name}</span>
                    <a
                      href={r.published!.publishedUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[11.5px] font-semibold text-brand hover:underline"
                    >
                      {r.published!.title || r.published!.publishedUrl}
                    </a>
                  </span>
                </li>
              ))}
            </Block>
          )}
        </>
      )}
    </section>
  );
}

/* ─────────── 조각 ─────────── */

function HeadStat({
  label,
  value,
  warn,
  muted,
}: {
  label: string;
  value: number;
  warn?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="text-right">
      <div
        className={
          'num text-[26px] font-extrabold leading-none tracking-tight ' +
          (warn ? 'text-[#D9A55C]' : muted ? 'text-[color:var(--text-faint)]' : '')
        }
      >
        {value}
      </div>
      <div className="mt-1 text-[11.5px] font-bold text-muted-foreground">{label}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'brand' | 'warn' | 'plain';
}) {
  const color =
    tone === 'warn' ? '#D9A55C' : tone === 'brand' ? 'hsl(var(--brand))' : 'var(--text-faint)';
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="num text-[19px] font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[11px] font-bold text-muted-foreground">{label}</div>
    </div>
  );
}

function Block({
  title,
  tone,
  collapsedHint,
  children,
}: {
  title: string;
  tone?: 'warn';
  collapsedHint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[color:var(--border-row)] last:border-b-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1.5">
        <span
          className="text-[11.5px] font-extrabold uppercase tracking-[0.06em]"
          style={{ color: tone === 'warn' ? '#D9A55C' : 'var(--text-quaternary)' }}
        >
          {title}
        </span>
        {collapsedHint && (
          <span className="text-[11px] font-semibold text-[color:var(--text-faint)]">
            {collapsedHint}
          </span>
        )}
      </div>
      <ul className="pb-1.5">{children}</ul>
    </div>
  );
}

function Item({
  platform,
  name,
  sub,
  right,
}: {
  platform: string;
  name: string;
  sub: string;
  right: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5 px-4 py-1.5">
      <Mark platform={platform} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold">{name}</span>
        {sub && (
          <span className="block truncate text-[11px] font-semibold text-[color:var(--text-faint)]">
            {sub}
          </span>
        )}
      </span>
      <span className="shrink-0">{right}</span>
    </li>
  );
}

function Mark({ platform }: { platform: string }) {
  const ps = platformStyle(platform);
  return (
    <span
      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md text-[11px] font-black"
      style={{ background: ps.chipBg, color: ps.dot }}
      title={ps.label}
    >
      {ps.mark}
    </span>
  );
}

function Tag({
  children,
  warn,
  muted,
}: {
  children: React.ReactNode;
  warn?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[11px] font-extrabold"
      style={
        warn
          ? { background: 'rgba(217,165,92,0.15)', color: '#D9A55C' }
          : muted
            ? { background: '#252A2F', color: '#8A939C' }
            : { background: 'rgba(217,165,92,0.09)', color: '#C0A177' }
      }
    >
      {children}
    </span>
  );
}
