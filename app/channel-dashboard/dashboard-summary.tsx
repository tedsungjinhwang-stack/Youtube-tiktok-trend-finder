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
  /** 최근 발행된 글/영상 (publishedUrl 입력된 것 중 최신) */
  published?: { title: string; url: string; scheduledAt: string } | null;
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

/**
 * 목록에 찍는 채널 표기 — 분류가 있으면 "이름(분류)".
 * 이름만으로는 어느 계열인지 구분이 안 돼서 목록에서는 항상 분류를 같이 보여준다.
 */
export function channelCaption(c: { name: string; category: string | null }): string {
  return c.category ? `${c.name}(${c.category})` : c.name;
}

/** KPI 한 장. 숫자 색은 값이 있을 때만 의미색을 쓴다. */
function KpiCard({
  title,
  value,
  detail,
  tone,
  compact,
}: {
  title: string;
  value: number;
  detail: string;
  tone: 'red' | 'amber' | 'plain';
  compact: boolean;
}) {
  // plain 은 색을 지정하지 않고 본문색을 그대로 물려받는다
  const color = tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : undefined;
  return (
    <div
      className={'card-surface theme-fade rounded-[20px] ' + (compact ? 'px-4 py-3.5' : 'px-[22px] py-5')}
    >
      <div className="text-[13px] font-bold text-muted-foreground">{title}</div>
      <div
        className={
          'num mt-2 font-extrabold leading-none tracking-[-0.045em] ' +
          (compact ? 'text-[25px]' : 'text-[30px]')
        }
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      <div className="mt-2 line-clamp-2 text-[12.5px] font-semibold text-[color:var(--text-faint)]">
        {detail}
      </div>
    </div>
  );
}

export function DashboardSummary({
  channels,
  unit = '채널',
  showSortLabel = true,
  showPublished = false,
  showSchedule = true,
  compact = false,
}: {
  channels: SummaryChannel[];
  /** '채널' | '계정' — 그룹별 단위 명칭 */
  unit?: string;
  /** 하단 '플랫폼별 · 임박한 순' 라벨 (아래에 테이블이 있을 때만 의미 있음) */
  showSortLabel?: boolean;
  /** '최근 발행한 글' 섹션 (스레드처럼 발행 링크를 관리하는 그룹) */
  showPublished?: boolean;
  /**
   * 예약 기반 지표(KPI 3장 + '예약이 끝나는 순서').
   * 스레드처럼 예약을 안 쓰는 그룹에서는 전부 '예약 없음'으로만 떠서 의미가 없다.
   */
  showSchedule?: boolean;
  /** 밀도 압축 — 전체 현황처럼 한 화면에 담아야 할 때 */
  compact?: boolean;
}) {
  const withD = channels.map((c) => ({ c, d: channelDDay(c) }));
  const empty = withD.filter((x) => x.d === null);
  const soon = withD.filter((x) => x.d !== null && x.d <= 1);
  const relaxed = withD.filter((x) => x.d !== null && x.d >= 2);
  const todayNeed = empty.length + soon.length;

  const sorted = [...channels].sort(byUrgency);

  return (
    <>
      {showSchedule && (
      <>
      {/* KPI 3장 — 값이 0 이면 색을 빼서 '문제 없음'이 한눈에 보이게 한다 */}
      <div className={(compact ? 'mb-2.5 gap-2.5 ' : 'mb-3 gap-2.5 ') + 'grid grid-cols-1 sm:grid-cols-3'}>
        <KpiCard
          title="오늘 업로드 필요"
          value={todayNeed}
          tone={todayNeed > 0 ? 'red' : 'plain'}
          detail={`예약 없음 ${empty.length} · 소진 임박 ${soon.length}`}
          compact={compact}
        />
        <KpiCard
          title="예약 소진 임박 (D-1 이내)"
          value={soon.length}
          tone={soon.length > 0 ? 'amber' : 'plain'}
          detail={
            soon.length === 0
              ? '없음'
              : soon
                  .sort((a, b) => a.d! - b.d!)
                  .map((x) => `${channelCaption(x.c)} ${ddayLabel(x.d)}`)
                  .join(' · ')
          }
          compact={compact}
        />
        <KpiCard
          title={`여유 있는 ${unit} (D-2 이상)`}
          value={relaxed.length}
          tone="plain"
          detail={relaxed.length === 0 ? '없음' : relaxed.map((x) => channelCaption(x.c)).join(' · ')}
          compact={compact}
        />
      </div>

      {/* 예약이 끝나는 순서 */}
      <section className={(compact ? 'mb-3 ' : 'mb-4 ') + 'card-surface theme-fade rounded-[22px]'}>
        <div className={'flex items-center justify-between gap-3 px-[22px] ' + (compact ? 'py-2.5' : 'py-3')}>
          <h2 className="text-[14px] font-extrabold tracking-tight">예약이 끝나는 순서</h2>
          <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
            임박한 순
          </span>
        </div>
        <div className={(compact ? 'gap-2 p-3 [grid-template-columns:repeat(auto-fill,minmax(228px,1fr))] ' : 'gap-2.5 p-4 [grid-template-columns:repeat(auto-fill,minmax(268px,1fr))] ') + 'grid'}>
          {sorted.map((c) => {
            const d = channelDDay(c);
            const urgent = isUrgent(d);
            const ps = platformStyle(c.platform);
            return (
              <div
                key={c.id}
                className={'flex items-center gap-2.5 rounded-2xl px-3.5 ' + (compact ? 'py-2' : 'py-2.5')}
                style={{ background: urgent ? 'var(--red-bg)' : 'var(--subtle)' }}
              >
                <span
                  className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-[12px] font-black"
                  style={{ background: ps.chipBg, color: ps.dot }}
                >
                  {ps.mark}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold" title={channelCaption(c)}>
                    {channelCaption(c)}
                  </span>
                  <span className="block truncate text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                    {c.lastScheduledAt
                      ? `마지막 예약 ${kstShort(c.lastScheduledAt)}`
                      : '예약된 영상 없음'}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-[9px] px-2 py-1 text-[12.5px] font-extrabold"
                  // 임박 타일은 배경이 이미 붉으므로 배지는 패널색을 깔아야 글자가 뜬다
                  style={
                    urgent
                      ? { background: 'var(--panel)', color: 'var(--red)' }
                      : d === 2
                        ? { background: 'var(--amber-bg)', color: 'var(--amber)' }
                        : { background: 'var(--chip)', color: 'var(--text-faint)' }
                  }
                >
                  {ddayLabel(d)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      </>
      )}

      {/* 최근 발행한 글 */}
      {showPublished && (
        <section className={(compact ? 'mb-3 ' : 'mb-4 ') + 'card-surface theme-fade rounded-[22px]'}>
          <div className={'flex items-center justify-between gap-3 px-[22px] ' + (compact ? 'py-2.5' : 'py-3')}>
            <h2 className="text-[14px] font-extrabold tracking-tight">최근 발행한 글</h2>
            <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
              발행 링크가 입력된 항목
            </span>
          </div>
          {channels.filter((c) => c.published).length === 0 ? (
            <p className={'px-4 text-center text-[12.5px] text-muted-foreground ' + (compact ? 'py-5' : 'py-8')}>
              아직 없습니다. 예약 행의 「발행 링크」 칸에 게시물 URL 을 넣으면 여기 표시됩니다.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--border-row)]">
              {channels
                .filter((c) => c.published)
                .sort(
                  (a, b) =>
                    new Date(b.published!.scheduledAt).getTime() -
                    new Date(a.published!.scheduledAt).getTime()
                )
                .map((c) => {
                  const ps = platformStyle(c.platform);
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-lg text-[11.5px] font-black"
                        style={{ background: ps.chipBg, color: ps.dot }}
                      >
                        {ps.mark}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold" title={channelCaption(c)}>
                          {channelCaption(c)}
                        </span>
                        <a
                          href={c.published!.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-[12px] font-semibold text-brand hover:underline"
                          title={c.published!.url}
                        >
                          {c.published!.title || c.published!.url}
                        </a>
                      </span>
                      <span className="num shrink-0 text-[12px] font-semibold text-[color:var(--text-faint)]">
                        {kstShort(c.published!.scheduledAt)}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      )}

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
