/**
 * 채널 수익창출(애드센스 승인) 상태.
 *
 * 콘텐츠 카테고리(정치/국뽕 등)와는 별개의 속성이다. 세 단계로 둔 이유는
 * 확인 안 된 채널을 '수창 완료'로 단정하지 않기 위해서 — 기본값은 UNKNOWN 이고,
 * 사람이 직접 바꿀 때만 바뀐다 (API 연결·구독자 수·애드센스 칸으로 추정하지 않는다).
 */
export const MONETIZATION_STATUSES = ['PRE_MONETIZATION', 'MONETIZED', 'UNKNOWN'] as const;
export type MonetizationStatus = (typeof MONETIZATION_STATUSES)[number];

export const MONETIZATION_LABEL: Record<MonetizationStatus, string> = {
  PRE_MONETIZATION: '수창 전',
  MONETIZED: '수창 완료',
  UNKNOWN: '미확인',
};

export function isMonetizationStatus(v: unknown): v is MonetizationStatus {
  return typeof v === 'string' && (MONETIZATION_STATUSES as readonly string[]).includes(v);
}

/** 컬럼이 없거나 이상한 값이면 UNKNOWN 으로 읽는다 */
export function monetizationOf(c: { monetizationStatus?: string | null }): MonetizationStatus {
  return isMonetizationStatus(c.monetizationStatus) ? c.monetizationStatus : 'UNKNOWN';
}

export function isPreMonetization(c: { monetizationStatus?: string | null }): boolean {
  return monetizationOf(c) === 'PRE_MONETIZATION';
}

/**
 * 목록 정렬 키. 수창 전만 맨 아래로 보내고 나머지(수창 완료·미확인)는 기존 순서를 그대로 둔다.
 * 미확인을 따로 빼면 검증 안 된 기존 채널들이 상태 하나 때문에 자리를 옮기게 된다.
 */
export function monetizationRank(c: { monetizationStatus?: string | null }): number {
  return isPreMonetization(c) ? 1 : 0;
}

/** 대시보드 보기 필터 */
export type MonetizationFilter = 'all' | 'operating' | 'pre';

export function matchesMonetizationFilter(
  c: { monetizationStatus?: string | null },
  f: MonetizationFilter
): boolean {
  if (f === 'all') return true;
  return f === 'pre' ? isPreMonetization(c) : !isPreMonetization(c);
}
