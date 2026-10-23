/**
 * 대시보드 그룹 정의 — 클라이언트/서버 공용 (Prisma 의존 없음).
 * lib/todoist.ts 는 이 파일을 재-export 한다.
 */

/**
 * 대시보드 / Todoist 프로젝트 그룹. MyChannel.todoistGroup 값과 동일.
 * 'shopping' 은 예전 '쇼핑쇼츠' 시절 이름이고 지금은 인스타 그룹이다 — DB 값·Todoist 설정 칼럼이
 * 이 키를 쓰고 있어서 키는 그대로 두고 표시명·경로·플랫폼만 바꿨다.
 */
export type DashboardGroup = 'youtube' | 'shopping' | 'naverclip' | 'threads';

export const DASHBOARD_GROUPS: DashboardGroup[] = ['youtube', 'shopping', 'naverclip', 'threads'];

/** 그룹별 화면 표시명 */
export const GROUP_LABEL: Record<DashboardGroup, string> = {
  youtube: '유튜브',
  shopping: '인스타',
  naverclip: '네이버클립',
  threads: '스레드',
};

/**
 * 그룹별로 대시보드에 **보이는** 플랫폼.
 * TikTok 은 유튜브 채널에 짝으로 붙여 쓰므로 유튜브 쪽에만 둔다.
 */
export const GROUP_PLATFORMS: Record<DashboardGroup, string[]> = {
  youtube: ['YOUTUBE', 'TIKTOK'],
  shopping: ['INSTAGRAM'],
  naverclip: ['NAVER_CLIP'],
  threads: ['THREADS'],
};

/**
 * 그룹별 단위 명칭. 유튜브는 '채널', 인스타·네이버클립·스레드는 '계정'.
 * 화면 문구("+ OO 추가", "총 N개 OO" 등)에 사용.
 */
export const GROUP_UNIT: Record<DashboardGroup, string> = {
  youtube: '채널',
  shopping: '계정',
  naverclip: '계정',
  threads: '계정',
};

/** 그룹별 페이지 경로 */
export const GROUP_PATH: Record<DashboardGroup, string> = {
  youtube: '/channel-dashboard',
  shopping: '/instagram-dashboard',
  naverclip: '/naverclip-dashboard',
  threads: '/threads-dashboard',
};

/** 플랫폼만 보고 기본 그룹 추정 (채널 생성 시 초기값). TikTok 은 youtube 기본. */
export function defaultGroupForPlatform(platform: string): DashboardGroup {
  const p = platform.toUpperCase();
  if (p === 'THREADS') return 'threads';
  if (p === 'NAVER_CLIP') return 'naverclip';
  if (p === 'INSTAGRAM' || p === 'FACEBOOK') return 'shopping';
  return 'youtube';
}

/**
 * 외부 도구(업로드 매니저 등)가 DB 에 직접 넣는 그룹 이름 → 대시보드 그룹 키.
 * 실제로 인스타 계정 7개가 'instagram' 으로 들어와 전체 현황·Todoist 에서 통째로 빠졌다
 * (화면 이름은 '인스타'로 바꿨지만 내부 키는 예전 'shopping' 이라서).
 */
const GROUP_ALIASES: Record<string, DashboardGroup> = {
  instagram: 'shopping',
  insta: 'shopping',
  naver_clip: 'naverclip',
  naver: 'naverclip',
};

/**
 * 채널이 실제로 속하는 그룹. 아는 키면 그대로, 별칭이면 바꿔서, 모르는 값이면 플랫폼으로 정한다.
 * 그룹 값만 믿고 묶으면 모르는 값이 들어왔을 때 채널이 어느 목록에도 안 나온다.
 */
export function resolveGroup(todoistGroup: string | null | undefined, platform: string): DashboardGroup {
  const g = (todoistGroup ?? '').trim().toLowerCase();
  if ((DASHBOARD_GROUPS as string[]).includes(g)) return g as DashboardGroup;
  if (g in GROUP_ALIASES) return GROUP_ALIASES[g];
  return defaultGroupForPlatform(platform);
}

/** API 로 들어온 그룹 값 정리 — 별칭은 대시보드 키로, 모르는 값은 null(무시) */
export function normalizeGroupInput(v: unknown): DashboardGroup | null {
  if (typeof v !== 'string') return null;
  const g = v.trim().toLowerCase();
  if ((DASHBOARD_GROUPS as string[]).includes(g)) return g as DashboardGroup;
  return GROUP_ALIASES[g] ?? null;
}
