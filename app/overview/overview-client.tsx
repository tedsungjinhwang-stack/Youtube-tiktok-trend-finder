'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { kstTodayDate, kstTodayLabel } from '@/lib/kst';
import { quoteOfDay } from '@/lib/quotes';
import { SAEROI_PHOTOS } from '@/components/saeroi-avatar';
import { TodoCard } from './todo-card';
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
  profile?: string | null;
  isActive: boolean;
  todoistGroup?: string | null;
  videos: Video[];
};

/** 그룹 아이콘 — 대표 플랫폼의 마크와 색을 그대로 쓴다 (테마 따라 바뀌게 CSS 변수) */
const GROUP_MARK: Record<DashboardGroup, { mark: string; bg: string; fg: string }> = {
  youtube: { mark: 'Y', bg: 'var(--plat-youtube-bg)', fg: 'var(--plat-youtube-fg)' },
  shopping: { mark: 'N', bg: 'var(--plat-naver-bg)', fg: 'var(--plat-naver-fg)' },
  threads: { mark: '@', bg: 'var(--plat-threads-bg)', fg: 'var(--plat-threads-fg)' },
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
        profile: ch.profile ?? null,
        lastScheduledAt: future[0]?.scheduledAt ?? null,
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
      {err && (
        <div className="surface-warn mb-4 rounded-xl border px-4 py-3 text-[13px] font-semibold">
          {err}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.045em]">전체 현황</h1>
        <p className="mt-1 text-[13.5px] font-semibold text-muted-foreground">
          {kstTodayLabel()} KST · 전체 {channels.length}개
        </p>
      </div>

      {/* 오늘의 한마디(좌) + 할 일(우). 좁은 화면에서는 위아래로 쌓인다 */}
      <div className="mb-3 grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <blockquote className="card-surface theme-fade grid overflow-hidden rounded-[24px] sm:grid-cols-[150px_1fr]">
          {/* 사진: 좌측 고정 폭. 오른쪽 끝을 카드 배경색으로 흐려 글과 이어지게 한다 */}
          <div className="relative hidden min-h-[200px] sm:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 정적 파일 */}
            <img
              src={SAEROI_PHOTOS.danbam.src}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full select-none object-cover"
              style={{ objectPosition: '50% 18%' }}
            />
            <div className="absolute inset-0" style={{ background: 'var(--photo-fade)' }} />
          </div>
          <div className="flex flex-col justify-center gap-2.5 px-[22px] py-[26px]">
            <span className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-brand">
              오늘의 한마디
            </span>
            <p className="text-[17px] font-extrabold leading-[1.55] tracking-[-0.035em] text-foreground">
              “{quote.text}”
            </p>
            <footer className="text-[13px] font-bold text-muted-foreground">{quote.who}</footer>
          </div>
        </blockquote>

        <TodoCard />
      </div>

      {/* 오늘의 현황판 */}
      <div className="mb-[30px] grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <ScoreCell label="오늘 업로드 필요" value={totalNeed} tone={totalNeed > 0 ? 'red' : 'plain'} />
        <ScoreCell label="소진 임박 (D-1)" value={totalSoon} tone={totalSoon > 0 ? 'amber' : 'plain'} />
        <ScoreCell label="여유 (D-2 이상)" value={totalRelaxed} tone="sub" />
      </div>

      {/* 그룹별로 세로 스택 (compact 밀도) */}
      <div className="flex flex-col gap-[30px]">
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
              {/* 그룹 헤더 — 배경 없이 아이콘 + 이름만 (카드가 바로 아래 오므로) */}
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <Link href={GROUP_PATH[g]} className="group flex min-w-0 items-center gap-2.5">
                  <span
                    className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[9px] text-[12.5px] font-black"
                    style={{ background: GROUP_MARK[g].bg, color: GROUP_MARK[g].fg }}
                  >
                    {GROUP_MARK[g].mark}
                  </span>
                  <span className="truncate text-[18px] font-extrabold tracking-[-0.035em] group-hover:text-brand">
                    {GROUP_LABEL[g]}
                  </span>
                  <span
                    className="num shrink-0 rounded-full px-[9px] py-[3px] text-[12.5px] font-bold text-[color:var(--text-quaternary)]"
                    style={{ background: 'var(--chip)' }}
                  >
                    {rows.length}
                  </span>
                  {risk > 0 && (
                    <span
                      className="num shrink-0 rounded-full px-[9px] py-[3px] text-[12.5px] font-bold"
                      style={{ background: 'var(--red-bg)', color: 'var(--red)' }}
                      title={`업로드 필요 ${risk}`}
                    >
                      필요 {risk}
                    </span>
                  )}
                </Link>
                <Link
                  href={GROUP_PATH[g]}
                  className="shrink-0 text-[13px] font-bold text-muted-foreground hover:text-foreground"
                >
                  대시보드 →
                </Link>
              </div>

              {rows.length === 0 ? (
                <div className="card-surface theme-fade rounded-[22px] px-4 py-10 text-center text-[14px] font-semibold text-muted-foreground">
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
  /** plain 은 본문색 — 0 일 때 색을 빼서 '문제 없음'이 바로 읽히게 한다 */
  tone: 'red' | 'amber' | 'sub' | 'plain';
}) {
  const color =
    tone === 'red'
      ? 'var(--red)'
      : tone === 'amber'
        ? 'var(--amber)'
        : tone === 'sub'
          ? 'var(--text-quaternary)'
          : undefined;
  return (
    <div className="card-surface theme-fade rounded-[20px] px-[22px] py-5">
      <div
        className="num text-[30px] font-extrabold leading-none tracking-[-0.045em]"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      <div className="mt-2.5 text-[13.5px] font-semibold text-muted-foreground">{label}</div>
    </div>
  );
}
