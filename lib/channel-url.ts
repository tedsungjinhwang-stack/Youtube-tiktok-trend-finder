/**
 * 채널 주소 만들기.
 *
 * `MyChannel.url` 에는 전체 주소가 아니라 핸들(`@눕무비`)만 들어 있는 경우가 많다.
 * 그대로 href 에 넣으면 상대경로가 돼서 대시보드 안에서 404 로 떨어진다.
 * 플랫폼을 보고 전체 주소로 만들어 준다.
 */

/** 핸들 앞의 @ 와 공백 제거 */
function bareHandle(v: string): string {
  return v.trim().replace(/^@+/, '');
}

const BY_PLATFORM: Record<string, (h: string) => string> = {
  YOUTUBE: (h) => `https://www.youtube.com/@${h}`,
  THREADS: (h) => `https://www.threads.net/@${h}`,
  TIKTOK: (h) => `https://www.tiktok.com/@${h}`,
  INSTAGRAM: (h) => `https://www.instagram.com/${h}`,
  FACEBOOK: (h) => `https://www.facebook.com/${h}`,
};

/**
 * 화면에서 열 수 있는 주소. 만들 수 없으면 null 이고, 그때는 링크 대신 그냥 글자로 둔다.
 * (아무 데도 안 가는 링크보다 낫다)
 */
export function channelHref(
  platform: string | null | undefined,
  url: string | null | undefined
): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  // 이미 전체 주소면 그대로
  if (/^https?:\/\//i.test(raw)) return raw;
  // 'www.youtube.com/@x' 처럼 스킴만 빠진 경우 (점이 여러 개일 수 있다)
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(raw)) return `https://${raw}`;

  const handle = bareHandle(raw);
  if (!handle) return null;
  const build = BY_PLATFORM[(platform ?? '').toUpperCase()];
  // 네이버클립처럼 핸들만으로 주소를 만들 수 없는 플랫폼은 링크를 걸지 않는다
  return build ? build(handle) : null;
}
