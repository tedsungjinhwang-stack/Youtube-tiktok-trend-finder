/**
 * 플랫폼별 표시 스타일. 마크 칩 / 색점 / 상태 칩에서 공통으로 사용.
 *
 * 색은 hex 를 직접 들고 있지 않고 globals.css 의 CSS 변수를 가리킨다.
 * 다크/라이트 세트가 각각 정의돼 있어서, 이렇게 해야 테마를 바꿀 때
 * 이 파일을 거치지 않고 색이 따라온다 (인라인 style 에 var() 를 넣어도 동작한다).
 */

export type PlatformKey =
  | 'YOUTUBE'
  | 'TIKTOK'
  | 'INSTAGRAM'
  | 'FACEBOOK'
  | 'THREADS'
  | 'NAVER_CLIP'
  | 'XIAOHONGSHU'
  | 'DOUYIN';

export type PlatformStyle = {
  /** 마크 칩 글자 */
  mark: string;
  /** 한글 표시명 */
  label: string;
  /** 색점·마크 텍스트 색 */
  dot: string;
  /** 칩 배경 */
  chipBg: string;
  /** 칩 텍스트 */
  chipText: string;
};

export const PLATFORM_STYLE: Record<string, PlatformStyle> = {
  YOUTUBE: {
    mark: 'Y',
    label: 'YouTube',
    dot: 'var(--plat-youtube-fg)',
    chipBg: 'var(--plat-youtube-bg)',
    chipText: 'var(--plat-youtube-fg)',
  },
  TIKTOK: {
    mark: 'T',
    label: 'TikTok',
    dot: 'var(--plat-tiktok-fg)',
    chipBg: 'var(--plat-tiktok-bg)',
    chipText: 'var(--plat-tiktok-fg)',
  },
  INSTAGRAM: {
    mark: 'I',
    label: 'Instagram',
    dot: 'var(--plat-instagram-fg)',
    chipBg: 'var(--plat-instagram-bg)',
    chipText: 'var(--plat-instagram-fg)',
  },
  FACEBOOK: {
    mark: 'F',
    label: 'Facebook',
    dot: 'var(--plat-facebook-fg)',
    chipBg: 'var(--plat-facebook-bg)',
    chipText: 'var(--plat-facebook-fg)',
  },
  THREADS: {
    mark: '@',
    label: 'Threads',
    dot: 'var(--plat-threads-fg)',
    chipBg: 'var(--plat-threads-bg)',
    chipText: 'var(--plat-threads-fg)',
  },
  NAVER_CLIP: {
    mark: 'N',
    label: '네이버클립',
    dot: 'var(--plat-naver-fg)',
    chipBg: 'var(--plat-naver-bg)',
    chipText: 'var(--plat-naver-fg)',
  },
  XIAOHONGSHU: {
    mark: '小',
    label: '샤오홍수',
    dot: 'var(--plat-youtube-fg)',
    chipBg: 'var(--plat-youtube-bg)',
    chipText: 'var(--plat-youtube-fg)',
  },
  DOUYIN: {
    mark: '抖',
    label: '도우인',
    dot: 'var(--plat-tiktok-fg)',
    chipBg: 'var(--plat-tiktok-bg)',
    chipText: 'var(--plat-tiktok-fg)',
  },
};

const FALLBACK: PlatformStyle = {
  mark: '?',
  label: '기타',
  dot: 'var(--plat-etc-fg)',
  chipBg: 'var(--plat-etc-bg)',
  chipText: 'var(--plat-etc-fg)',
};

export function platformStyle(p: string | null | undefined): PlatformStyle {
  if (!p) return FALLBACK;
  return PLATFORM_STYLE[p.toUpperCase()] ?? FALLBACK;
}
