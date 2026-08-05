/**
 * 매일 바뀌는 한 줄 — JTBC 드라마 「이태원 클라쓰」(2020) 실제 대사.
 *
 * 전부 극중에서 실제로 나온 대사만 담았다. 여러 출처에서 교차 확인되지 않은
 * 문장은 넣지 않는다 (지어낸 문장을 '명대사'로 표시하면 안 되므로).
 * 날짜(KST)를 씨앗으로 결정론적으로 고르므로 하루 동안 같은 문장이 유지된다.
 */

export type Quote = { text: string; who: string };

export const QUOTES: Quote[] = [
  {
    text: '내 가치를 네가 정하지 마. 내 인생 이제 시작이고, 난 원하는 거 다 이루면서 살 거야.',
    who: '박새로이',
  },
  {
    text: '가난해서, 못 배워서, 범죄자라서 안 된다고, 안 될 거라고 미리 정해 놓고 그래서 뭘 하겠어요. 해 보고 판단해야지.',
    who: '박새로이',
  },
  {
    text: '쉬울 거라 생각 안 했어. 어렵게 하면 되지. 나 혼자면 무리가 있겠지만, 너희들이 있잖아.',
    who: '박새로이',
  },
  { text: '마음먹었으면 그 마음에 충실해.', who: '박새로이' },
  {
    text: '지금 한 번. 지금만 한 번. 마지막으로 한 번. 또, 또 한 번. 순간은 편하겠지. 그런데 말이야, 그 한 번들로 사람은 변하는 거야.',
    who: '박새로이',
  },
  {
    text: '시간은 흐른다. 분명 시간은 누구에게나 공평하게 흐른다. 하지만 그와 나의 시간은 그 농도가 너무나도 달랐다.',
    who: '박새로이',
  },
  {
    text: '장사에서 가장 중요한 건 사람, 신뢰. 돈보다 사람을 중시하고, 이득보다 신뢰를 중시하겠습니다.',
    who: '박새로이',
  },
  {
    text: '제가 생각하는 강함은 사람에게서 나옵니다. 그 사람들의 신뢰가 저를 더 단단하게 해 줍니다.',
    who: '박새로이',
  },
  { text: '이제, 행복하자.', who: '박새로이' },
  { text: '이미 나는 더할 나위 없이 행복하다.', who: '박새로이' },
  { text: '마음은 기브 앤 테이크가 아니라고요. 제 마음은 제 거예요.', who: '조이서' },
  { text: '대표님을 좋아하는 건 내 마음이고 권리예요.', who: '조이서' },
  {
    text: '소신, 패기… 없는 것들이 자존심 지키자고 쓰는 단어. 이득이 없다면 고집이고 객기일 뿐이야.',
    who: '장대희',
  },
];

/** KST 기준 날짜 문자열(YYYY-MM-DD) → 에포크 기준 일수 (하루마다 정확히 1씩 증가) */
function dayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * 목록 길이와 서로소인 보폭. 이러면 (일수 × 보폭) % 길이가 전체를 한 바퀴 도는
 * 순열이 되어 ① 한 주기 안에 모든 대사가 정확히 한 번씩 나오고
 * ② 연속한 날이 같은 대사가 되는 일이 없다 (목록 개수를 바꿔도 유지된다).
 */
const STRIDE = (() => {
  const n = QUOTES.length;
  for (let k = Math.floor(n / 2); k > 1; k--) if (gcd(k, n) === 1) return k;
  return 1;
})();

/** 그 날의 대사 (같은 날엔 항상 같은 문장) */
export function quoteOfDay(kstDate: string): Quote {
  const n = QUOTES.length;
  return QUOTES[(((dayIndex(kstDate) * STRIDE) % n) + n) % n];
}
