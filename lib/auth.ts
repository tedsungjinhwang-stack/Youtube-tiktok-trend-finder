import { NextRequest } from 'next/server';
import { getCredSync } from '@/lib/credentials';

/**
 * OpenClaw / external API auth: Bearer 토큰 또는 사이트 로그인 쿠키 둘 중 하나면 통과.
 *  - Bearer: 외부 에이전트 (OpenClaw/ChatGPT 등)
 *  - tf_site_auth 쿠키: 본인이 로그인한 브라우저
 */
export function checkApiKey(req: NextRequest): boolean {
  // 1) Bearer 토큰 검사
  const expectedBearer = getCredSync('OPENCLAW_API_KEY');
  const header = req.headers.get('authorization');
  if (header && expectedBearer) {
    const [scheme, token] = header.split(' ');
    if (scheme === 'Bearer' && token && token === expectedBearer) return true;
  }

  // 2) 사이트 로그인 쿠키 검사 (같은 도메인 브라우저에서 호출 시)
  const sitePassword = process.env.SITE_PASSWORD;
  if (sitePassword) {
    const cookie = req.cookies.get('tf_site_auth')?.value;
    if (cookie === sitePassword) return true;
  } else {
    // SITE_PASSWORD 미설정 → 사이트 가드 비활성 → 같은 origin 호출 모두 허용
    // (로컬 개발 편의. 프로덕션은 SITE_PASSWORD 반드시 설정 권장)
    if (header == null) return true;
  }

  return false;
}

export function checkCronAuth(req: NextRequest): boolean {
  const expected = getCredSync('CRON_SECRET');
  if (!expected) return false;
  return req.headers.get('authorization') === `Bearer ${expected}`;
}
