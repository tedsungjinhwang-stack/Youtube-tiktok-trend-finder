/**
 * Google OAuth (Calendar API 동기화용).
 *
 * 필요 env:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI   (예: https://your-app.vercel.app/api/google/callback)
 *
 * Flow:
 *   1. UI 가 /api/google/auth/start 호출 → Google consent URL 받음 → window.open
 *   2. 사용자가 Google 에서 동의 → GOOGLE_REDIRECT_URI 로 ?code=... redirect
 *   3. /api/google/callback 이 code → token 교환 → DB 저장 → "닫으셔도 됩니다" 페이지
 *   4. UI 가 polling 으로 연결 상태 확인 (혹은 그냥 새로고침)
 */

import { prisma } from '@/lib/db';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

function clientCfg() {
  const cid = process.env.GOOGLE_CLIENT_ID;
  const csec = process.env.GOOGLE_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_REDIRECT_URI;
  if (!cid || !csec || !redirect) {
    throw new Error(
      'Google OAuth 미설정: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI 환경변수를 추가해주세요.'
    );
  }
  return { cid, csec, redirect };
}

/** Consent URL 생성 (state 로 CSRF 방지) */
export function buildAuthUrl(state: string): string {
  const { cid, redirect } = clientCfg();
  const p = new URLSearchParams({
    client_id: cid,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

type TokenJson = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
};

/** code → token */
export async function exchangeCode(code: string): Promise<TokenJson> {
  const { cid, csec, redirect } = clientCfg();
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cid,
      client_secret: csec,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!r.ok) throw new Error(`code exchange 실패 (${r.status}): ${await r.text()}`);
  return r.json();
}

/** refresh_token 으로 새 access_token */
export async function refresh(refreshToken: string): Promise<TokenJson> {
  const { cid, csec } = clientCfg();
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cid,
      client_secret: csec,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!r.ok) throw new Error(`refresh 실패 (${r.status}): ${await r.text()}`);
  return r.json();
}

/** id_token 에서 이메일 추출 (서명검증 생략 — 첫 응답에서만 사용) */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split('.')[1];
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
    return (json.email as string) ?? null;
  } catch {
    return null;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  const row = await prisma.googleOAuth.findUnique({ where: { id: 'default' } }).catch(() => null);
  if (!row) return null;
  if (row.expiresAt.getTime() > Date.now() + 60_000) return row.accessToken;
  // refresh
  try {
    const t = await refresh(row.refreshToken);
    await prisma.googleOAuth.update({
      where: { id: 'default' },
      data: {
        accessToken: t.access_token,
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
      },
    });
    return t.access_token;
  } catch {
    return null;
  }
}

export async function getStatus() {
  try {
    const row = await prisma.googleOAuth.findUnique({ where: { id: 'default' } });
    if (!row) return { connected: false, email: null, calendarId: null };
    return {
      connected: true,
      email: row.accountEmail,
      calendarId: row.calendarId,
    };
  } catch {
    return { connected: false, email: null, calendarId: null };
  }
}

export async function disconnect() {
  await prisma.googleOAuth.deleteMany({ where: { id: 'default' } });
}
