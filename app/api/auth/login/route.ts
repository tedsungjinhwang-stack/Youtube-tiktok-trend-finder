import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'tf_site_auth';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

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
  res.cookies.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', {
    path: '/',
    maxAge: 0,
  });
  return res;
}
