import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatViews(n: bigint | number | null | undefined): string {
  if (n == null) return '–';
  const num = typeof n === 'bigint' ? Number(n) : n;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

/** Korean abbreviated number: 1,234 → '1.2천', 12,345 → '1.2만', 123,456,789 → '1.2억' */
export function formatKr(n: bigint | number | null | undefined): string {
  if (n == null) return '–';
  const num = typeof n === 'bigint' ? Number(n) : n;
  if (num >= 100_000_000) return `${(num / 100_000_000).toFixed(1)}억`;
  if (num >= 10_000) return `${(num / 10_000).toFixed(num >= 100_000 ? 0 : 1)}만`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}천`;
  return String(num);
}

/**
 * 영상 길이/타입별 한국 평균 RPM (원/view).
 * - 쇼츠 (≤60s): 0.15~0.20원 (1만 = 1.5~2천원, 100만 = 15~20만원)
 * - 롱폼 (≥8분=480s, 중간광고 가능): 2.0~2.3원 (1만 = 2~2.3만원)
 * - 중간 (60~480s, 중간광고 불가): 쇼츠 기준으로 보수적 추정
 */
export function getRpmRange(
  durationSeconds?: number | null,
  isShorts?: boolean | null
): [number, number] {
  if (isShorts) return [0.15, 0.2];
  if (durationSeconds == null) return [0.15, 0.2];
  if (durationSeconds <= 60) return [0.15, 0.2];
  if (durationSeconds >= 480) return [2.0, 2.3];
  return [0.15, 0.2];
}

/**
 * 예상 수익 범위 (KRW).
 * opts 미지정 시 쇼츠 RPM(0.15~0.20)으로 추정.
 * 단위가 같으면 한 번만 표기: 100만 → "15~20만원", 542만 → "81~108만원".
 * 단위가 다르면 둘 다 표기: 5억 → "7500만~1.0억원".
 */
export function formatRevenueRange(
  views: number | null | undefined,
  opts: { durationSeconds?: number | null; isShorts?: boolean | null } = {}
): string {
  if (!views || views <= 0) return '–';
  const [rpmMin, rpmMax] = getRpmRange(opts.durationSeconds, opts.isShorts);
  const loStr = formatKr(Math.round(views * rpmMin));
  const hiStr = formatKr(Math.round(views * rpmMax));
  const lo = splitKrUnit(loStr);
  const hi = splitKrUnit(hiStr);
  if (lo.unit === hi.unit) return `${lo.num}~${hi.num}${hi.unit}원`;
  return `${loStr}~${hiStr}원`;
}

function splitKrUnit(s: string): { num: string; unit: string } {
  const m = s.match(/^([\d.]+)(억|만|천)?$/);
  if (!m) return { num: s, unit: '' };
  return { num: m[1], unit: m[2] ?? '' };
}

/** Per-hour abbreviated: 33000 → '3.3만/h' */
export function formatKrPerHour(n: number | null | undefined): string {
  if (n == null) return '–';
  return `${formatKr(n)}/h`;
}

/** Multiplier vs channel average: 0.51 → '0.5배', 12.4 → '12배' */
export function formatMultiplier(x: number | null | undefined): string {
  if (x == null) return '–';
  return `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}배`;
}
