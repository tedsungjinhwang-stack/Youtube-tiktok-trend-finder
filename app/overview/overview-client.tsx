'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { kstTodayLabel } from '@/lib/kst';
import {
  DashboardSummary,
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

type Video = { id: string; title: string; scheduledAt: string };

type Channel = {
  id: string;
  name: string;
  platform: string;
  category: string | null;
  isActive: boolean;
  todoistGroup?: string | null;
  videos: Video[];
};

/** 그룹 헤더 악센트 (대표 플랫폼 색) */
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

  /** 그룹 → 요약용 채널 목록 */
  const byGroup = useMemo(() => {
    const map = new Map<DashboardGroup, SummaryChannel[]>();
    for (const g of DASHBOARD_GROUPS) map.set(g, []);
    for (const ch of channels) {
      const g = (ch.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(ch.platform);
      const future = [...ch.videos].sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      );
      map.get(g)?.push({
        id: ch.id,
        name: ch.name,
        platform: ch.platform,
        category: ch.category,
        lastScheduledAt: future[0]?.scheduledAt ?? null,
      });
    }
    return map;
  }, [channels]);

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

      <div className="mb-5">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">전체 현황</h1>
        <p className="mt-1.5 text-[13px] font-semibold text-muted-foreground">
          {kstTodayLabel()} KST · 전체 {channels.length}개 — 플랫폼별 발행 예약 현황
        </p>
      </div>

      {/* 그룹별로 대시보드 요약을 그대로 쌓음 */}
      <div className="flex flex-col gap-8">
        {DASHBOARD_GROUPS.map((g) => {
          const rows = byGroup.get(g) ?? [];
          const unit = GROUP_UNIT[g];
          return (
            <section key={g}>
              {/* 그룹 헤더 */}
              <div
                className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5"
                style={{
                  background: `linear-gradient(90deg, ${GROUP_ACCENT[g]}14, transparent 55%)`,
                }}
              >
                <Link href={GROUP_PATH[g]} className="group flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: GROUP_ACCENT[g] }}
                  />
                  <span className="truncate text-[16px] font-extrabold tracking-tight group-hover:text-brand">
                    {GROUP_LABEL[g]}
                  </span>
                  <span className="num shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11.5px] font-bold text-[color:var(--text-quaternary)]">
                    {rows.length}
                  </span>
                </Link>
                <Link
                  href={GROUP_PATH[g]}
                  className="shrink-0 text-[12px] font-bold text-muted-foreground hover:text-foreground"
                >
                  {GROUP_LABEL[g]} 대시보드 →
                </Link>
              </div>

              {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[color:var(--border-dashed)] px-4 py-10 text-center text-[13px] text-muted-foreground">
                  등록된 {unit}이 없습니다
                </div>
              ) : (
                <DashboardSummary channels={rows} unit={unit} showSortLabel={false} />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
