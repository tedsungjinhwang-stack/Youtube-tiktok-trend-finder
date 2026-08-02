'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { kstTodayLabel } from '@/lib/kst';
import {
  DashboardSummary,
  channelDDay,
  type SummaryChannel,
} from '../channel-dashboard/dashboard-summary';
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

/** 그룹 악센트 (대표 플랫폼 색) */
const GROUP_ACCENT: Record<DashboardGroup, string> = {
  youtube: '#E0685F',
  shopping: '#57B37E',
  threads: '#C9CCD1',
};

export function OverviewClient() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<DashboardGroup>('youtube');

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

  /** 그룹 → 요약용 채널 목록 */
  const byGroup = useMemo(() => {
    const map = new Map<DashboardGroup, SummaryChannel[]>();
    for (const g of DASHBOARD_GROUPS) map.set(g, []);
    for (const ch of channels) {
      const g = (ch.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(ch.platform);
      const future = [...ch.videos].sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      );
      const pub = future.find((v) => !!v.publishedUrl);
      map.get(g)?.push({
        id: ch.id,
        name: ch.name,
        platform: ch.platform,
        category: ch.category,
        lastScheduledAt: future[0]?.scheduledAt ?? null,
        published: pub
          ? { title: pub.title, url: pub.publishedUrl!, scheduledAt: pub.scheduledAt }
          : null,
      });
    }
    return map;
  }, [channels]);

  if (loading) {
    return <div className="p-8 text-[15px] text-muted-foreground">로딩 중…</div>;
  }

  const rows = byGroup.get(tab) ?? [];
  const unit = GROUP_UNIT[tab];

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-10 pt-5">
      {err && (
        <div className="surface-warn mb-4 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      {/* 헤더 + 탭 한 줄 */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.03em]">전체 현황</h1>
          <p className="mt-1 text-[12.5px] font-semibold text-muted-foreground">
            {kstTodayLabel()} KST · 전체 {channels.length}개
          </p>
        </div>
        <Link
          href={GROUP_PATH[tab]}
          className="h-9 shrink-0 rounded-lg border border-input px-3.5 pt-2 text-[12.5px] font-bold text-muted-foreground hover:border-[color:var(--border-hover)] hover:text-foreground"
        >
          {GROUP_LABEL[tab]} 대시보드 →
        </Link>
      </div>

      {/* 그룹 탭 — 각 탭에 위험 개수 배지 */}
      <div
        role="tablist"
        aria-label="플랫폼 그룹"
        className="mb-4 flex gap-1 rounded-xl border border-border bg-card p-1"
      >
        {DASHBOARD_GROUPS.map((g) => {
          const list = byGroup.get(g) ?? [];
          const risk = list.filter((c) => {
            const d = channelDDay(c);
            return d === null || d <= 1;
          }).length;
          const active = tab === g;
          return (
            <button
              key={g}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(g)}
              className={
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors ' +
                (active
                  ? 'bg-secondary font-extrabold text-foreground'
                  : 'font-semibold text-muted-foreground hover:text-foreground')
              }
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: GROUP_ACCENT[g], opacity: active ? 1 : 0.5 }}
              />
              {GROUP_LABEL[g]}
              <span className="num text-[color:var(--text-faint)]">{list.length}</span>
              {risk > 0 && (
                <span
                  className="num rounded px-1.5 text-[11px] font-bold"
                  style={{ background: 'rgba(217,165,92,0.15)', color: '#D9A55C' }}
                  title={`업로드 필요 ${risk}`}
                >
                  {risk}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 선택된 그룹 요약 */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--border-dashed)] px-4 py-14 text-center text-[13px] text-muted-foreground">
          등록된 {unit}이 없습니다
        </div>
      ) : (
        <DashboardSummary
          channels={rows}
          unit={unit}
          showSortLabel={false}
          showPublished={tab === 'threads'}
          compact
        />
      )}
    </div>
  );
}
