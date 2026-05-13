export type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';

export type ParsedChannel = {
  platform: Platform;
  externalId: string; // YT: UCxxx or @handle / TT,IG: handle (lowercase)
  handle: string;
};

/**
 * Accept any of:
 *   YouTube:   https://youtube.com/@xxx | youtube.com/channel/UCxxx | @xxx
 *   TikTok:    https://www.tiktok.com/@xxx | tiktok.com/@xxx | @xxx
 *   Instagram: https://www.instagram.com/xxx | instagram.com/xxx | xxx
 *
 * For ambiguous inputs ('@xxx' or bare 'xxx'), pass `hint` to disambiguate.
 */
export function parseChannelInput(
  raw: string,
  hint?: Platform
): ParsedChannel | { error: string } {
  const input = raw.trim();
  if (!input) return { error: '빈 입력' };

  const url = tryUrl(input);

  if (url) {
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');

    if (host.endsWith('youtube.com') || host === 'youtu.be') {
      const m = path.match(/^\/(?:c\/|user\/|channel\/)?([^\/]+)/);
      if (!m) return { error: 'YouTube URL 파싱 실패' };
      const seg = decodeURIComponent(m[1]);
      const externalId = seg.startsWith('@') ? seg : seg.startsWith('UC') ? seg : `@${seg}`;
      return {
        platform: 'YOUTUBE',
        externalId,
        handle: externalId.startsWith('@') ? externalId : `@${seg}`,
      };
    }

    if (host.endsWith('tiktok.com')) {
      const m = path.match(/^\/@?([^\/]+)/);
      if (!m) return { error: 'TikTok URL 파싱 실패' };
      const handle = '@' + decodeURIComponent(m[1]).toLowerCase();
      return { platform: 'TIKTOK', externalId: handle, handle };
    }

    if (host.endsWith('instagram.com')) {
      const m = path.match(/^\/([^\/]+)/);
      if (!m) return { error: 'Instagram URL 파싱 실패' };
      const handle = '@' + decodeURIComponent(m[1]).toLowerCase();
      return { platform: 'INSTAGRAM', externalId: handle, handle };
    }

    if (host.endsWith('xiaohongshu.com') || host.endsWith('xhscdn.com') || host === 'xhslink.com') {
      // https://www.xiaohongshu.com/user/profile/{userId}
      const m = path.match(/\/user\/profile\/([^/]+)/);
      if (!m) return { error: 'Xiaohongshu URL 파싱 실패 — /user/profile/{id} 형식 필요' };
      const id = decodeURIComponent(m[1]);
      return { platform: 'XIAOHONGSHU', externalId: id, handle: '@' + id };
    }

    if (host.endsWith('douyin.com') || host === 'iesdouyin.com') {
      // https://www.douyin.com/user/{secUid}
      const m = path.match(/^\/user\/([^/]+)/);
      if (!m) return { error: 'Douyin URL 파싱 실패 — /user/{secUid} 형식 필요' };
      const id = decodeURIComponent(m[1]);
      return { platform: 'DOUYIN', externalId: id, handle: '@' + id.slice(0, 12) };
    }

    return { error: '지원 안 하는 도메인' };
  }

  // not a URL — handle / bare name
  const cleaned = input.replace(/^@/, '').toLowerCase();
  if (!cleaned) return { error: '빈 핸들' };
  const handle = `@${cleaned}`;

  if (hint) {
    return { platform: hint, externalId: handle, handle };
  }

  return { error: 'URL이 아니면 플랫폼을 지정해주세요' };
}
function tryUrl(s: string): URL | null {
  try {
    if (!/^https?:\/\//i.test(s)) {
      // protocol 누락 시 보강해서 시도
      if (/^(www\.)?(youtube|tiktok|instagram|youtu|xiaohongshu|douyin|xhslink|iesdouyin)\./i.test(s)) {
        return new URL(`https://${s}`);
      }
      return null;
    }
    return new URL(s);
  } catch {
    return null;
  }
}
