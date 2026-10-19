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

/**
 * 급상승 분야 → 1달·3달(explore) 분야 번호. 같은 칩으로 기간만 바꿔 볼 수 있게 한다.
 * 47·7·5·19·396 은 실제로 조회해 결과가 맞는 걸 확인했다 (자동차·경제·기술·사회·정치).
 * 65·958·174·66 은 확인 중 구글이 429 를 걸어서 구글 공식 분류표 번호를 그대로 썼다.
 * 날씨·기타는 1달·3달 쪽에 대응하는 분야가 없다 (null).
 */
export const TRENDING_TO_EXPLORE: Record<number, number | null> = {
  4: 3, // 드라마·영화·인물 → Arts & Entertainment
  16: 18, // 쇼핑 → Shopping
  2: 44, // 뷰티·패션 → Beauty & Fitness
  5: 71, // 음식 → Food & Drink
  17: 20, // 스포츠
  6: 8, // 게임
  8: 65, // 취미 → Hobbies & Leisure
  19: 67, // 여행
  7: 45, // 건강
  18: 5, // 기술 → Computers & Electronics
  1: 47, // 자동차
  3: 7, // 경제 → Finance
  14: 396, // 정치
  10: 19, // 사회·법 → Law & Government
  9: 958, // 교육·취업 → Jobs & Education
  15: 174, // 과학
  13: 66, // 반려동물
  20: null, // 날씨
  11: null, // 기타
};
