/**
 * 꿀통레이더 화면 데이터 모양 — 화면(클라이언트)과 서버가 같이 쓴다.
 *
 * 흐름: 경쟁 채널 쇼츠를 감시 → 갑자기 뜬 쇼츠를 작품에 붙임 → 그 작품 출연진의 다른 작품 중
 * '조회는 나오는데 다루는 채널이 적은 것'(꿀통)과 '아직 아무도 안 만든 것'(빈자리)을 보여 준다.
 */

/** 한국/해외 × 영화/드라마/예능 */
export type WorkCategory = 'kr_movie' | 'kr_drama' | 'kr_variety' | 'intl_movie' | 'intl_drama' | 'intl_variety';

export const CATEGORY_LABEL: Record<WorkCategory, string> = {
  kr_movie: '한국 영화',
  kr_drama: '한국 드라마',
  kr_variety: '한국 예능',
  intl_movie: '해외 영화',
  intl_drama: '해외 드라마',
  intl_variety: '해외 예능',
};

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as WorkCategory[];

export type ShortClip = {
  videoId: string;
  title: string;
  channel: string;
  views: number;
  publishedAt: string;
  /** 썸네일 주소 (없으면 회색 칸) */
  thumb: string | null;
};

export type WorkRef = {
  key: string;
  title: string;
  year: string;
  category: WorkCategory;
  /** TMDB 포스터 경로 (/abc.jpg) */
  poster: string | null;
  /** 방송사·제작사 등 (MBC, Netflix, 제작사 ○○) */
  tags: string[];
  /** 지금 방영·연재 중 */
  onAir?: boolean;
};

export type RelatedWork = WorkRef & {
  /** 이 작품으로 이어지는 출연자 (예: 양동근 출연) */
  via: string[];
  /** 감시 채널에서 이 작품 쇼츠의 최고 조회 */
  maxViews: number;
  /** 100만 넘은 쇼츠 수 */
  millionCount: number;
  /** 이 작품을 다룬 감시 채널 수 = 경쟁 */
  channels: number;
  topShorts: ShortClip[];
};

export type RisingWork = WorkRef & {
  cast: string[];
  /** 기간 안에 뜬 쇼츠 수 */
  recentShorts: number;
  recentViews: number;
  maxViews: number;
  /** 이 작품을 다룬 감시 채널 수 */
  channels: number;
  /** 송곳주의 — 쇼츠 1편·채널 1곳만 터진 경우. 반짝일 수 있다 */
  spike: boolean;
  topShort: ShortClip;
  related: RelatedWork[];
  /** 출연진의 다른 작품 중 감시 채널에 쇼츠가 하나도 없는 것 */
  unmeasured: { title: string; year: string; category: WorkCategory }[];
};

export type CrowdedWork = WorkRef & {
  channels: number;
  recentShorts: number;
  avgViews: number;
  /** 직전 같은 기간 대비 평균 조회 변화 % */
  trend: number;
};

export type RadarData = {
  /** 예시 데이터면 true — 화면 위에 안내를 띄운다 */
  sample?: boolean;
  collectedAt: string;
  monitoredChannels: number;
  groups: string[];
  summary: {
    surgingShorts: number;
    risingWorks: number;
    honeyPots: number;
    crowded: number;
    /** 급상승 쇼츠 중 작품을 찾은 비율 % */
    matchRate: number;
  };
  rising: RisingWork[];
  crowded: CrowdedWork[];
  unmatched: ShortClip[];
};

/** 꿀통 기준 — 조회는 나오는데(30만+) 다루는 채널이 적다(2곳 이하) */
export function isHoneyPot(r: { maxViews: number; channels: number }): boolean {
  return r.maxViews >= 300_000 && r.channels <= 2;
}
