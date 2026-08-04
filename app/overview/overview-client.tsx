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

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-5">
      {err && (
        <div className="surface-warn mb-4 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em]">전체 현황</h1>
        <p className="mt-1 text-[12.5px] font-semibold text-muted-foreground">
          {kstTodayLabel()} KST · 전체 {channels.length}개
        </p>
      </div>

      {/* 그룹별로 세로 스택 (compact 밀도) */}
      <div className="flex flex-col gap-6">
        {DASHBOARD_GROUPS.map((g) => {
          const rows = byGroup.get(g) ?? [];
          const unit = GROUP_UNIT[g];
          const risk = rows.filter((c) => {
            const d = channelDDay(c);
            return d === null || d <= 1;
          }).length;
          return (
            <section key={g}>
              {/* 그룹 헤더 */}
              <div
                className="mb-2.5 flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2"
                style={{
                  background: `linear-gradient(90deg, ${GROUP_ACCENT[g]}14, transparent 55%)`,
                }}
              >
                <Link href={GROUP_PATH[g]} className="group flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: GROUP_ACCENT[g] }}
                  />
                  <span className="truncate text-[15px] font-extrabold tracking-tight group-hover:text-brand">
                    {GROUP_LABEL[g]}
                  </span>
                  <span className="num shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11.5px] font-bold text-[color:var(--text-quaternary)]">
                    {rows.length}
                  </span>
                  {risk > 0 && (
                    <span
                      className="num shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold"
                      style={{ background: 'rgba(217,165,92,0.15)', color: '#D9A55C' }}
                      title={`업로드 필요 ${risk}`}
                    >
                      필요 {risk}
                    </span>
                  )}
                </Link>
                <Link
                  href={GROUP_PATH[g]}
                  className="shrink-0 text-[12px] font-bold text-muted-foreground hover:text-foreground"
                >
                  대시보드 →
                </Link>
              </div>

              {rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[color:var(--border-dashed)] px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                  등록된 {unit}이 없습니다
                </div>
              ) : (
                <DashboardSummary
                  channels={rows}
                  unit={unit}
                  showSortLabel={false}
                  showPublished={g === 'threads'}
                  compact
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
