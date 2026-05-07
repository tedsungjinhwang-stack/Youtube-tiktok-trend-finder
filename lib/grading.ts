/**
 * 영상 등급 / 증가속도 배지 — pure 함수, 서버·클라 양쪽에서 사용.
 *
 * 1) View grade (절대 조회수 티어): 1만↑ S → 1억↑ GOD
 * 2) Growth badge (시간당 증가율): 1만↑/h 급상승, 5만↑/h 떡상중
 *
 * 임계치 변경은 이 파일만 수정.
 */

export type ViewGrade = {
  tier: 'GOD' | 'SSS' | 'SS' | 'S';
  emoji: string;
  label: string;
  /** 카드에 입힐 색 — Tailwind text/border classes */
  color: string;
};

export function getViewGrade(viewCount: number): ViewGrade | null {
  if (viewCount >= 100_000_000) {
    return {
      tier: 'GOD',
      emoji: '💎',
      label: 'GOD',
      color: 'text-cyan-300 border-cyan-400/50',
    };
  }
  if (viewCount >= 10_000_000) {
    return {
      tier: 'SSS',
      emoji: '🏆',
      label: 'SSS',
      color: 'text-amber-400 border-amber-400/50',
    };
  }
  if (viewCount >= 1_000_000) {
    return {
      tier: 'SS',
      emoji: '⚡',
      label: 'SS',
      color: 'text-yellow-300 border-yellow-300/50',
    };
  }
  if (viewCount >= 100_000) {
    return {
      tier: 'S',
      emoji: '👍',
      label: 'S',
      color: 'text-blue-300 border-blue-300/50',
    };
  }
  return null;
}

export type GrowthBadge = {
  tier: 'TTUKSANG' | 'SURGING';
  emoji: string;
  label: string;
  /** 시간당 조회수 (반올림) */
  perHour: number;
  color: string;
};

/**
 * 시간당 조회수 = viewCount / 게시 후 경과 시간(시간 단위).
 * 5만↑/h = 떡상중, 1만↑/h = 급상승.
 * 게시 직후 (1시간 미만)는 1시간으로 클램프하여 분모 폭주 방지.
 */
export function getGrowthBadge(
  viewCount: number,
  publishedAt: Date | string
): GrowthBadge | null {
  const published =
    publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
  const hours = Math.max(
    1,
    (Date.now() - published.getTime()) / (60 * 60 * 1000)
  );
  const perHour = viewCount / hours;

  if (perHour >= 50_000) {
    return {
      tier: 'TTUKSANG',
      emoji: '🚀',
      label: '떡상중',
      perHour: Math.round(perHour),
      color: 'bg-red-500/90 text-white',
    };
  }
  if (perHour >= 10_000) {
    return {
      tier: 'SURGING',
      emoji: '📈',
      label: '급상승',
      perHour: Math.round(perHour),
      color: 'bg-orange-500/90 text-white',
    };
  }
  return null;
}

/* ----------------------------- 순위 기반 배지 ----------------------------- */

export type RankBadge = {
  tier: 'HOT' | 'PICK';
  emoji: string;
  label: string;
  /** Tailwind classes for the #rank pill */
  pillClass: string;
};

/**
 * pint.kr 패턴: 정렬 결과 톱3 = HOT, 10등 구간 선두 = 주목.
 * HOT이 우선. rank는 1부터.
 */
export function getRankBadge(rank: number): RankBadge | null {
  if (rank <= 3) {
    return {
      tier: 'HOT',
      emoji: '🔥',
      label: 'HOT',
      pillClass: 'bg-red-500/95 text-white shadow-md shadow-red-500/30',
    };
  }
  if (rank % 10 === 1) {
    return {
      tier: 'PICK',
      emoji: '👀',
      label: '주목',
      pillClass: 'bg-purple-500/95 text-white',
    };
  }
  return null;
}

/* ----------------------------- 검증된 히트 ----------------------------- */

/** 50만↑ 누적 조회수면 "검증된 히트" — 카드 테두리/별 마크 강조용 */
export const VERIFIED_HIT_THRESHOLD = 500_000;

export function isVerifiedHit(viewCount: number): boolean {
  return viewCount >= VERIFIED_HIT_THRESHOLD;
}

/* ----------------------------- helpers ----------------------------- */

/** 단순 시간당 조회수 계산만 필요할 때 */
export function viewsPerHour(
  viewCount: number,
  publishedAt: Date | string
): number {
  const published =
    publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
  const hours = Math.max(
    1,
    (Date.now() - published.getTime()) / (60 * 60 * 1000)
  );
  return viewCount / hours;
}
