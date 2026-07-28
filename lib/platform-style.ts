/**
 * 플랫폼별 표시 스타일 (리디자인 팔레트 — 원색 대신 채도·명도를 맞춘 톤다운 값).
 * 마크 칩 / 색점 / 상태 칩에서 공통으로 사용.
 */

export type PlatformKey =
  | 'YOUTUBE'
  | 'TIKTOK'
  | 'INSTAGRAM'
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
    dot: '#E0685F',
    chipBg: 'rgba(224,104,95,0.15)',
    chipText: '#E5837B',
  },
  TIKTOK: {
    mark: 'T',
    label: 'TikTok',
    dot: '#6FC9C6',
    chipBg: 'rgba(111,201,198,0.15)',
    chipText: '#85D2CF',
  },
  INSTAGRAM: {
    mark: 'I',
    label: 'Instagram',
    dot: '#D07EA0',
    chipBg: 'rgba(208,126,160,0.15)',
    chipText: '#DB94B2',
  },
  THREADS: {
    mark: '@',
    label: 'Threads',
    dot: '#C9CCD1',
    chipBg: 'rgba(201,204,209,0.10)',
    chipText: '#C2C6CB',
  },
  NAVER_CLIP: {
    mark: 'N',
    label: '네이버클립',
    dot: '#57B37E',
    chipBg: 'rgba(87,179,126,0.15)',
    chipText: '#79C79A',
  },
  XIAOHONGSHU: {
    mark: '小',
    label: '샤오홍수',
    dot: '#DE9A94',
    chipBg: 'rgba(224,104,95,0.12)',
    chipText: '#DE9A94',
  },
  DOUYIN: {
    mark: '抖',
    label: '도우인',
    dot: '#8FC6C4',
    chipBg: 'rgba(111,201,198,0.12)',
    chipText: '#8FC6C4',
  },
};

const FALLBACK: PlatformStyle = {
  mark: '?',
  label: '기타',
  dot: '#8A939C',
  chipBg: '#252A2F',
  chipText: '#98A2AB',
};

export function platformStyle(p: string | null | undefined): PlatformStyle {
  if (!p) return FALLBACK;
  return PLATFORM_STYLE[p.toUpperCase()] ?? FALLBACK;
}
