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
 * 예상 수익 범위 (KRW). 한국 쇼츠 평균 RPM 0.15~0.20원/view 기준.
 * 단위가 같으면 한 번만 표기: 100만 → "15~20만원", 542만 → "81~108만원".
 * 단위가 다르면 둘 다 표기: 5억 → "7500만~1억원".
 */
export function formatRevenueRange(
  views: number | null | undefined,
  rpmMin = 0.15,
  rpmMax = 0.2
): string {
  if (!views || views <= 0) return '–';
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
