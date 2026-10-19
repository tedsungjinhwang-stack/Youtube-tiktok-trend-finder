/**
 * 트렌드 탭 분야 목록 — 화면(클라이언트)과 서버가 같이 쓴다.
 * google.ts 는 서버 전용 라이브러리(undici·prisma)를 불러서 화면에서 import 하면 안 되므로 따로 둔다.
 */

/**
 * 급상승 분야 번호 → 이름 (실측: 7일치 1,231건을 번호별로 묶어 보고 맞춤).
 * 화면에는 드라마·영화·쇼핑을 먼저 둔다.
 */
export const TRENDING_CATEGORIES: { id: number; label: string }[] = [
  { id: 4, label: '드라마·영화·인물' },
  { id: 16, label: '쇼핑' },
  { id: 2, label: '뷰티·패션' },
  { id: 5, label: '음식' },
  { id: 17, label: '스포츠' },
  { id: 6, label: '게임' },
  { id: 8, label: '취미' },
  { id: 19, label: '여행' },
  { id: 7, label: '건강' },
  { id: 18, label: '기술' },
  { id: 1, label: '자동차' },
  { id: 3, label: '경제' },
  { id: 14, label: '정치' },
  { id: 10, label: '사회·법' },
  { id: 9, label: '교육·취업' },
  { id: 15, label: '과학' },
  { id: 13, label: '반려동물' },
  { id: 20, label: '날씨' },
  { id: 11, label: '기타' },
];

/** explore 분야 번호 (구글 트렌드 탐색 화면 기준) */
export const EXPLORE_CATEGORIES: { id: number; label: string }[] = [
  { id: 0, label: '전체' },
  { id: 3, label: '엔터테인먼트' },
  { id: 18, label: '쇼핑' },
  { id: 44, label: '뷰티·피트니스' },
  { id: 71, label: '음식' },
  { id: 20, label: '스포츠' },
  { id: 8, label: '게임' },
  { id: 67, label: '여행' },
  { id: 45, label: '건강' },
  { id: 16, label: '뉴스' },
];
