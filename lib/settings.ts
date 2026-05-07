/** Pure constants — server/client 모두 import 가능. cookies()는 호출 측에서 직접. */

export const COOKIE_KEY_MIN_VIEWS = 'tf_default_min_views';

export const BUILTIN_DEFAULTS = {
  minViews: 50_000,
} as const;

export type UserDefaults = {
  minViews: number;
};

export function numFromCookie(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
