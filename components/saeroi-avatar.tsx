/**
 * 오늘의 한마디 옆에 붙는 아바타.
 *
 * 실제 인물 사진을 따온 게 아니라 직접 그린 기하학적 플랫 아이콘이다.
 * (밤톨머리 + 수트 깃 실루엣 — 특정 인물의 얼굴이 아니라 '분위기'만 가져옴)
 */
export function SaeroiAvatar({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="오늘의 한마디"
      className="shrink-0"
    >
      <defs>
        <clipPath id="saeroi-clip">
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>

      <g clipPath="url(#saeroi-clip)">
        {/* 배경 */}
        <circle cx="32" cy="32" r="32" fill="#20242A" />
        <circle cx="32" cy="32" r="32" fill="hsl(166 42% 61%)" fillOpacity="0.10" />

        {/* 수트 어깨 */}
        <path d="M6 64c0-11.5 9.6-17.6 26-19.4C48.4 46.4 58 52.5 58 64H6z" fill="#2C3138" />
        {/* 셔츠 V */}
        <path d="M25.5 45.8 32 55.5l6.5-9.7-6.5-2.4-6.5 2.4z" fill="#D8DCE1" />
        {/* 넥타이 */}
        <path d="M32 55.5l3.1 3.4-1.4 5.1h-3.4l-1.4-5.1L32 55.5z" fill="#C46A5F" />

        {/* 목 */}
        <path d="M27 36h10v10c0 2.8-10 2.8-10 0V36z" fill="#D8A882" />

        {/* 얼굴 */}
        <path
          d="M32 12c8 0 12.5 5.2 12.5 13.4 0 8.8-5.6 16.1-12.5 16.1s-12.5-7.3-12.5-16.1C19.5 17.2 24 12 32 12z"
          fill="#EBC29B"
        />

        {/* 밤톨머리 — 앞머리를 눈썹 바로 위에서 가로로 자른 컷 */}
        <path
          d="M17.2 24.6V20.6C17.2 11.9 22.6 6 32 6s14.8 5.9 14.8 14.6v4H17.2z"
          fill="#241F1D"
        />
        {/* 옆머리 — 광대까지 내려오는 구레나룻 */}
        <path d="M17.2 21.4h3.4v11.4l-3.3-1.1-1-6.4c-.3-1.9.1-3.3.9-3.9z" fill="#241F1D" />
        <path d="M46.8 21.4h-3.4v11.4l3.3-1.1 1-6.4c.3-1.9-.1-3.3-.9-3.9z" fill="#241F1D" />

        {/* 눈썹 */}
        <rect x="23.4" y="26" width="6.2" height="1.7" rx=".85" fill="#241F1D" />
        <rect x="34.4" y="26" width="6.2" height="1.7" rx=".85" fill="#241F1D" />
        {/* 눈 */}
        <ellipse cx="26.5" cy="30.4" rx="1.5" ry="1.7" fill="#241F1D" />
        <ellipse cx="37.5" cy="30.4" rx="1.5" ry="1.7" fill="#241F1D" />
        {/* 입 — 다문 직선 */}
        <rect x="28.5" y="36.6" width="7" height="1.5" rx=".75" fill="#B9805C" />
      </g>
    </svg>
  );
}
