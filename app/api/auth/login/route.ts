import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// v2: 30일 → 세션 쿠키. 이름을 바꿔 기존 30일 쿠키를 자동 무효화함.
const COOKIE_NAME = 'tf_site_auth_v2';

export async function POST(req: NextRequest) {
  const { password, next } = await req.json().catch(() => ({}));
  const expected = process.env.SITE_PASSWORD;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'SITE_PASSWORD 환경변수가 서버에 설정되지 않았습니다.' },
      { status: 500 }
    );
  }
  if (typeof password !== 'string' || password !== expected) {
    return NextResponse.json(
      { ok: false, error: '비밀번호가 일치하지 않습니다.' },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true, next: next ?? '/' });
  // maxAge 미설정 → 세션 쿠키 (브라우저 닫으면 만료)
  res.cookies.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  // 구버전 쿠키도 같이 무효화 (혹시 잔존 시)
  res.cookies.set('tf_site_auth', '', { path: '/', maxAge: 0 });
  return res;
}
