'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { kstTodayDate, kstTodayLabel } from '@/lib/kst';
import { quoteOfDay } from '@/lib/quotes';
import { SaeroiAvatar, SAEROI_PHOTOS } from '@/components/saeroi-avatar';
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
        lastScheduledAt: future.find((v) => !v.publishedUrl)?.scheduledAt ?? null,
        published: pub
          ? { title: pub.title, url: pub.publishedUrl!, scheduledAt: pub.scheduledAt }
          : null,
      });
    }
    return map;
  }, [channels]);

  const quote = useMemo(() => quoteOfDay(kstTodayDate()), []);

  /**
   * 현황판 합계.
   * 스레드는 예약을 쓰지 않아 계정 전부가 '예약 없음'이다. 그대로 더하면
   * '오늘 업로드 필요'가 스레드 계정 수만큼 부풀어 숫자를 못 믿게 되므로 제외한다.
   */
  const totals = useMemo(() => {
    let need = 0;
    let soon = 0;
    let relaxed = 0;
    for (const [g, list] of byGroup) {
      if (g === 'threads') continue;
      for (const c of list) {
        const d = channelDDay(c);
        if (d === null || d <= 0) need += 1;
        else if (d === 1) soon += 1;
        else relaxed += 1;
      }
    }
    return { need, soon, relaxed };
  }, [byGroup]);

  if (loading) {
    return <div className="p-8 text-[15px] text-muted-foreground">로딩 중…</div>;
  }

  const { need: totalNeed, soon: totalSoon, relaxed: totalRelaxed } = totals;

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-5">
      {/*
        좌측 여백 아트 — 본문이 1180px 로 가운데 정렬돼 있어 넓은 화면에선 양쪽이 비는데,
        그 빈 폭만큼만 차지하는 고정 패널이라 본문 레이아웃에는 전혀 영향을 주지 않는다.
        여백이 좁은 화면에선 아예 렌더하지 않는다.
      */}
      <aside
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 hidden h-screen select-none items-center justify-center min-[1480px]:flex"
        style={{ width: 'calc((100vw - 1180px) / 2)' }}
      >
        {/* 폭을 원본 해상도에서 멈춘다 — 그 이상 늘리면 확대 보간이 들어가 뿌옇게 나온다 */}
        <div
          className="relative flex flex-col items-center"
          style={{ width: `min(90%, ${SAEROI_PHOTOS.danbam.width}px)` }}
        >
          {/* 뒤에 깔리는 은은한 발광 — 그냥 붙여넣은 것처럼 보이지 않게 */}
          <div
            className="absolute inset-0 -z-10 blur-2xl"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, rgba(111,201,177,0.14), transparent 68%)',
            }}
          />
          <SaeroiAvatar size="100%" variant="full" photo="danbam" />
        </div>
      </aside>

      {err && (
        <div className="surface-warn mb-4 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-3">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em]">전체 현황</h1>
        <p className="mt-1 text-[12.5px] font-semibold text-muted-foreground">
          {kstTodayLabel()} KST · 전체 {channels.length}개
        </p>
      </div>

      {/* 오늘의 한마디 — 날짜 기준으로 매일 바뀜 */}
      <blockquote
        className="mb-4 flex items-center gap-4 rounded-2xl border border-border px-5 py-3.5"
        style={{ background: 'linear-gradient(90deg, rgba(111,199,177,0.10), transparent 70%)' }}
      >
        <SaeroiAvatar size={112} variant="full" />
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-relaxed text-foreground">
            “{quote.text}”
          </p>
          <footer className="mt-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-brand">
            {quote.who}
          </footer>
        </div>
      </blockquote>

      {/* 오늘의 현황판 */}
      <div className="mb-5 grid grid-cols-3 divide-x divide-[color:var(--border-row)] overflow-hidden rounded-2xl border border-border bg-card">
        <ScoreCell label="오늘 업로드 필요" value={totalNeed} tone={totalNeed > 0 ? 'warn' : 'ok'} />
        <ScoreCell label="소진 임박 (D-1)" value={totalSoon} tone={totalSoon > 0 ? 'caution' : 'plain'} />
        <ScoreCell label="여유 (D-2 이상)" value={totalRelaxed} tone="plain" />
      </div>

      {/* 그룹별로 세로 스택 (compact 밀도) */}
      <div className="flex flex-col gap-6">
        {DASHBOARD_GROUPS.map((g) => {
          const rows = byGroup.get(g) ?? [];
          const unit = GROUP_UNIT[g];
          // 스레드는 예약 기준 지표를 안 쓰므로 '필요' 배지도 달지 않는다
          const risk =
            g === 'threads'
              ? 0
              : rows.filter((c) => {
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
                  showSchedule={g !== 'threads'}
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

/** 상단 현황판 한 칸 */
function ScoreCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'warn' | 'caution' | 'ok' | 'plain';
}) {
  const color =
    tone === 'warn'
      ? '#D9A55C'
      : tone === 'caution'
        ? '#C0A177'
        : tone === 'ok'
          ? 'hsl(var(--brand))'
          : 'var(--text-tertiary)';
  return (
    <div className="px-4 py-3 text-center">
      <div className="num text-[26px] font-extrabold leading-none tracking-tight" style={{ color }}>
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] font-bold text-muted-foreground">{label}</div>
    </div>
  );
}
