import { NextResponse, type NextRequest } from 'next/server';

/**
 * 단일 사용자 비밀번호 보호.
 * SITE_PASSWORD env 설정되면 활성화. 미설정이면 미들웨어 통과 (개발/로컬 편의).
 *
 * 흐름:
 *  1. /login 페이지 + /api/auth/login 은 미인증 허용
 *  2. /api/v1, /api/cron 은 Bearer 토큰 / CRON_SECRET 으로 별도 인증
 *  3. 그 외 페이지는 tf_site_auth_v2 쿠키 검사 (세션 쿠키) → 일치 안 하면 /login으로
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const sitePassword = process.env.SITE_PASSWORD;
  // 비밀번호 미설정 시 가드 비활성 (로컬/개발 편의)
  if (!sitePassword) return NextResponse.next();

  const cookie = req.cookies.get('tf_site_auth_v2')?.value;
  if (cookie === sitePassword) return NextResponse.next();

  // 쿠키 없거나 불일치 → 로그인으로 redirect (원래 url을 next 파라미터로 전달)
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
