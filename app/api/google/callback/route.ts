import { NextResponse } from 'next/server';
import { exchangeCode, emailFromIdToken } from '@/lib/google/oauth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function html(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Google 연결</title>
     <body style="font-family:system-ui;padding:48px;text-align:center;color:#0f172a">
       ${body}
     </body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err) return html(`<h2>연결 실패</h2><p>${err}</p>`, 400);
  if (!code) return html(`<h2>연결 실패</h2><p>code 없음</p>`, 400);
  try {
    const t = await exchangeCode(code);
    if (!t.refresh_token) {
      return html(
        `<h2>연결 실패</h2><p>refresh_token 이 안 옴. Google 계정 권한을 한 번 철회한 뒤 다시 시도해주세요.<br>
         (myaccount.google.com → 보안 → 타사 액세스에서 이 앱 제거)</p>`,
        400
      );
    }
    const email = emailFromIdToken(t.id_token);
    const expiresAt = new Date(Date.now() + t.expires_in * 1000);
    await prisma.googleOAuth.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt,
        accountEmail: email,
        calendarId: 'primary',
      },
      update: {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt,
        accountEmail: email,
      },
    });
    return html(
      `<h2>✓ Google 캘린더 연결됨</h2>
       <p>${email ?? ''}</p>
       <p>이 창은 닫으셔도 됩니다.</p>
       <script>setTimeout(()=>window.close(), 1500);</script>`
    );
  } catch (e) {
    return html(`<h2>연결 실패</h2><pre>${(e as Error).message}</pre>`, 500);
  }
}
