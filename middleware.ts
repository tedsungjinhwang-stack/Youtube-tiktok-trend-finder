import { NextResponse, type NextRequest } from 'next/server';

/**
 * Web auth: only OWNER_EMAIL can access. Real impl uses Supabase SSR helper.
 * MVP scaffold: lets through; auth wiring comes in Phase 2 with Supabase Auth.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api/v1/* uses Bearer token (lib/auth.ts); skip web auth.
  // /api/cron/* uses CRON_SECRET; skip.
  // /login is public.
  if (
    pathname.startsWith('/api/v1') ||
    pathname.startsWith('/api/cron') ||
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // TODO: integrate Supabase SSR — read cookie, check user.email === OWNER_EMAIL.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
