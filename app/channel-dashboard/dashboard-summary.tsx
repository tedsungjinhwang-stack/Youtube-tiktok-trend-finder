'use client';

import { kstDDay, kstShort, kstTodayLabel } from '@/lib/kst';
import { platformStyle } from '@/lib/platform-style';

export type SummaryChannel = {
  id: string;
  name: string;
  platform: string;
  category: string | null;
  /** 마지막(가장 미래) 예약 시각 ISO. 없으면 null */
  lastScheduledAt: string | null;
};

/** 채널별 D-day. 예약 없으면 null → 가장 먼저 정렬 */
export function channelDDay(c: SummaryChannel): number | null {
  return c.lastScheduledAt ? kstDDay(c.lastScheduledAt) : null;
}

/** 예약 없음 먼저, 그다음 D-day 오름차순 */
export function byUrgency(a: SummaryChannel, b: SummaryChannel): number {
  const da = channelDDay(a);
  const db = channelDDay(b);
  if (da === null && db === null) return a.name.localeCompare(b.name);
  if (da === null) return -1;
  if (db === null) return 1;
  if (da !== db) return da - db;
  return a.name.localeCompare(b.name);
}

/** D-day 표시 문자열 */
export function ddayLabel(d: number | null): string {
  if (d === null) return '예약 없음';
  if (d < 0) return '지남';
  if (d === 0) return 'D-DAY';
  return `D-${d}`;
}

/** 소진 임박(D-1 이내 또는 예약 없음) */
function isUrgent(d: number | null): boolean {
  return d === null || d <= 1;
}

export function DashboardSummary({
  channels,
  unit = '채널',
  showSortLabel = true,
}: {
  channels: SummaryChannel[];
  /** '채널' | '계정' — 그룹별 단위 명칭 */
  unit?: string;
  /** 하단 '플랫폼별 · 임박한 순' 라벨 (아래에 테이블이 있을 때만 의미 있음) */
  showSortLabel?: boolean;
}) {
  const withD = channels.map((c) => ({ c, d: channelDDay(c) }));
  const empty = withD.filter((x) => x.d === null);
  const soon = withD.filter((x) => x.d !== null && x.d <= 1);
  const relaxed = withD.filter((x) => x.d !== null && x.d >= 2);
  const todayNeed = empty.length + soon.length;

  const sorted = [...channels].sort(byUrgency);

  return (
    <>
      {/* KPI 3장 */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="surface-warn rounded-2xl border p-4">
          <div className="text-[12.5px] font-bold text-[#D7C6A6]">오늘 업로드 필요</div>
          <div className="mt-1.5 num text-[29px] font-extrabold leading-none tracking-tight text-[#D9A55C]">
            {todayNeed}
          </div>
          <div className="mt-2 text-[12px] font-semibold text-[#B09A76]">
            예약 없음 {empty.length} · 소진 임박 {soon.length}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[12.5px] font-bold text-muted-foreground">
            예약 소진 임박 (D-1 이내)
          </div>
          <div className="mt-1.5 num text-[29px] font-extrabold leading-none tracking-tight">
            {soon.length}
          </div>
          <div className="mt-2 line-clamp-2 text-[12px] font-semibold text-[color:var(--text-faint)]">
            {soon.length === 0
              ? '없음'
              : soon
                  .sort((a, b) => (a.d! - b.d!))
                  .map((x) => `${x.c.name} ${ddayLabel(x.d)}`)
                  .join(' · ')}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-[12.5px] font-bold text-muted-foreground">
            여유 있는 {unit} (D-2 이상)
          </div>
          <div className="mt-1.5 num text-[29px] font-extrabold leading-none tracking-tight">
            {relaxed.length}
          </div>
          <div className="mt-2 line-clamp-2 text-[12px] font-semibold text-[color:var(--text-faint)]">
            {relaxed.length === 0 ? '없음' : relaxed.map((x) => x.c.name).join(' · ')}
          </div>
        </div>
      </div>

      {/* 예약이 끝나는 순서 */}
      <section className="mb-4 rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-extrabold tracking-tight">예약이 끝나는 순서</h2>
          <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
            임박한 순
          </span>
        </div>
        <div className="grid gap-2.5 p-4 [grid-template-columns:repeat(auto-fill,minmax(268px,1fr))]">
          {sorted.map((c) => {
            const d = channelDDay(c);
            const urgent = isUrgent(d);
            const ps = platformStyle(c.platform);
            return (
              <div
                key={c.id}
                className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
                style={{
                  background: urgent ? '#221F19' : '#20242A',
                  borderColor: urgent ? '#3A3324' : '#2B3036',
                }}
              >
                <span
                  className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-[12px] font-black"
                  style={{ background: ps.chipBg, color: ps.dot }}
                >
                  {ps.mark}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold">{c.name}</span>
                  <span className="block truncate text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                    {c.lastScheduledAt
                      ? `마지막 예약 ${kstShort(c.lastScheduledAt)}`
                      : '예약된 영상 없음'}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-md px-2 py-1 text-[11.5px] font-extrabold"
                  style={
                    urgent
                      ? { background: 'rgba(217,165,92,0.15)', color: '#D9A55C' }
                      : d === 2
                        ? { background: 'rgba(217,165,92,0.09)', color: '#C0A177' }
                        : { background: '#252A2F', color: '#8A939C' }
                  }
                >
                  {ddayLabel(d)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 정렬 라벨 — 아래 테이블이 있을 때만 */}
      {showSortLabel && (
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[13px] font-bold">
        <span className="text-[color:var(--text-quaternary)]">플랫폼별 · 임박한 순</span>
        <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
          오늘 {kstTodayLabel()} KST · 총 {channels.length}{unit}
        </span>
      </div>
      )}
    </>
  );
}
