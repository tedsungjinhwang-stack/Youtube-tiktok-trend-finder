/**
 * 대시보드 그룹 정의 — 클라이언트/서버 공용 (Prisma 의존 없음).
 * lib/todoist.ts 는 이 파일을 재-export 한다.
 */

/** 대시보드 / Todoist 프로젝트 그룹. MyChannel.todoistGroup 값과 동일. */
export type DashboardGroup = 'youtube' | 'shopping' | 'threads';

export const DASHBOARD_GROUPS: DashboardGroup[] = ['youtube', 'shopping', 'threads'];

/** 그룹별 화면 표시명 */
export const GROUP_LABEL: Record<DashboardGroup, string> = {
  youtube: '유튜브',
  shopping: '쇼핑쇼츠',
  threads: '스레드',
};

/**
 * 그룹별로 대시보드에 **보이는** 플랫폼.
 * TikTok 은 유튜브·쇼핑쇼츠 양쪽에 보이지만, Todoist 귀속은 채널의 todoistGroup 이 정한다.
 */
export const GROUP_PLATFORMS: Record<DashboardGroup, string[]> = {
  youtube: ['YOUTUBE', 'TIKTOK'],
  shopping: ['NAVER_CLIP', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK'],
  threads: ['THREADS'],
};

/**
 * 그룹별 단위 명칭. 유튜브는 '채널', 쇼핑쇼츠·스레드는 '계정'.
 * 화면 문구("+ OO 추가", "총 N개 OO" 등)에 사용.
 */
export const GROUP_UNIT: Record<DashboardGroup, string> = {
  youtube: '채널',
  shopping: '계정',
  threads: '계정',
};

/** 그룹별 페이지 경로 */
export const GROUP_PATH: Record<DashboardGroup, string> = {
  youtube: '/channel-dashboard',
  shopping: '/shopping-dashboard',
  threads: '/threads-dashboard',
};

/** 플랫폼만 보고 기본 그룹 추정 (채널 생성 시 초기값). TikTok 은 youtube 기본. */
export function defaultGroupForPlatform(platform: string): DashboardGroup {
  const p = platform.toUpperCase();
  if (p === 'THREADS') return 'threads';
  if (p === 'INSTAGRAM' || p === 'NAVER_CLIP' || p === 'FACEBOOK') return 'shopping';
  return 'youtube';
}
