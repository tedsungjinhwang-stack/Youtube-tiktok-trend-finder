'use client';

/**
 * 7일 런웨이 타임라인 — 채널이 행, 앞으로 7일이 열.
 * "언제 예약이 끊기는가"를 리스트가 아니라 그림으로 보여준다.
 */

import Link from 'next/link';
import { isoToKstLocal, kstTodayDate } from '@/lib/kst';
import { platformStyle } from '@/lib/platform-style';
import { GROUP_LABEL, GROUP_PATH, type DashboardGroup } from '@/lib/todoist-groups';

export type RunwayVideo = { id: string; title: string; scheduledAt: string };

export type RunwayChannel = {
  id: string;
  name: string;
  platform: string;
  group: DashboardGroup;
  videos: RunwayVideo[];
};

/** 오늘부터 n일치 KST 날짜 문자열 */
export function nextDays(n: number): string[] {
  const today = kstTodayDate();
  const base = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

function dowOf(date: string): string {
  return DOW[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** 연속으로 예약이 채워진 일수 (오늘부터). 오늘이 비어있으면 0 */
export function runwayDays(ch: RunwayChannel, days: string[]): number {
  let n = 0;
  for (const d of days) {
    const has = ch.videos.some((v) => isoToKstLocal(v.scheduledAt).slice(0, 10) === d);
    if (!has) break;
    n += 1;
  }
  return n;
}

export function RunwayGrid({ channels }: { channels: RunwayChannel[] }) {
  const days = nextDays(7);
  const today = days[0];

  // 런웨이 짧은 순 = 위험한 순
  const sorted = [...channels].sort((a, b) => {
    const ra = runwayDays(a, days);
    const rb = runwayDays(b, days);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        {/* 날짜 헤더 */}
        <div className="grid items-end gap-px [grid-template-columns:200px_repeat(7,1fr)]">
          <div className="px-3 pb-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[color:var(--text-quaternary)]">
            채널 / 계정
          </div>
          {days.map((d) => {
            const isToday = d === today;
            const isWeekend = ['토', '일'].includes(dowOf(d));
            return (
              <div key={d} className="pb-2 text-center">
                <div
                  className={
                    'text-[10.5px] font-bold ' +
                    (isToday
                      ? 'text-brand'
                      : isWeekend
                        ? 'text-[#C0A177]'
                        : 'text-[color:var(--text-faint)]')
                  }
                >
                  {dowOf(d)}
                </div>
                <div
                  className={
                    'num text-[13px] font-extrabold leading-tight ' +
                    (isToday ? 'text-brand' : 'text-[color:var(--text-tertiary)]')
                  }
                >
                  {Number(d.slice(8, 10))}
                </div>
              </div>
            );
          })}
        </div>

        {/* 채널 행 */}
        <div className="flex flex-col gap-px">
          {sorted.map((ch) => {
            const ps = platformStyle(ch.platform);
            const runway = runwayDays(ch, days);
            const critical = runway === 0;
            return (
              <div
                key={ch.id}
                className="grid items-center gap-px rounded-md [grid-template-columns:200px_repeat(7,1fr)] hover:bg-[color:var(--surface-table-header)]"
              >
                {/* 채널명 */}
                <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                  <span
                    className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded text-[10.5px] font-black"
                    style={{ background: ps.chipBg, color: ps.dot }}
                    title={ps.label}
                  >
                    {ps.mark}
                  </span>
                  <Link
                    href={GROUP_PATH[ch.group]}
                    className="min-w-0 flex-1 truncate text-[12.5px] font-bold hover:text-brand"
                    title={`${ch.name} — ${GROUP_LABEL[ch.group]} 대시보드로`}
                  >
                    {ch.name}
                  </Link>
                  <span
                    className="num shrink-0 text-[11px] font-extrabold"
                    style={{ color: critical ? '#D9A55C' : runway <= 2 ? '#C0A177' : '#6E767E' }}
                    title={`앞으로 ${runway}일치 예약이 연속으로 있음`}
                  >
                    {runway}일
                  </span>
                </div>

                {/* 7일 셀 */}
                {days.map((d, i) => {
                  const vids = ch.videos.filter(
                    (v) => isoToKstLocal(v.scheduledAt).slice(0, 10) === d
                  );
                  const filled = vids.length > 0;
                  const withinRunway = i < runway;
                  const label = vids
                    .map((v) => `${isoToKstLocal(v.scheduledAt).slice(11, 16)} ${v.title || '제목 없음'}`)
                    .join('\n');
                  return (
                    <div key={d} className="px-0.5 py-1.5">
                      <div
                        title={filled ? label : '예약 없음'}
                        className="flex h-7 items-center justify-center rounded text-[10.5px] font-extrabold transition-colors"
                        style={
                          filled
                            ? {
                                background: withinRunway
                                  ? 'rgba(111,199,177,0.18)'
                                  : 'rgba(111,199,177,0.10)',
                                color: withinRunway ? '#8FD8C4' : '#6E9A8E',
                                boxShadow: 'inset 0 0 0 1px rgba(111,199,177,0.25)',
                              }
                            : {
                                background: 'transparent',
                                color: 'transparent',
                                boxShadow: `inset 0 0 0 1px ${
                                  i === 0 ? 'rgba(217,165,92,0.35)' : 'var(--border-row)'
                                }`,
                              }
                        }
                      >
                        {filled
                          ? vids.length > 1
                            ? `${vids.length}`
                            : isoToKstLocal(vids[0].scheduledAt).slice(11, 16)
                          : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
