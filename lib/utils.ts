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
