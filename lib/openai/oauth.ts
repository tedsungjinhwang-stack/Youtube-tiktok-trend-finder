/**
 * OpenAI OAuth (Codex CLI 방식 우회 — Sign in with ChatGPT, device flow).
 *
 * ⚠️ TOS 회색지대:
 *  - Codex CLI 의 client_id 를 비-Codex 컨텍스트에서 사용 → OpenAI 정책상 명시적 허용 X
 *  - 어느 날 차단될 수 있음. 차단되면 API key fallback 으로 동작.
 *  - 사용자 ChatGPT 계정 정지 위험 있음 (낮지만 0% 아님)
 *
 * Flow (RFC 8628 Device Authorization Grant):
 *  1. POST /oauth/device/code → device_code + user_code + verification_uri
 *  2. UI 가 user_code 와 verification_uri 표시. 사용자가 브라우저로 가서 코드 입력
 *  3. POST /oauth/token (grant_type=device_code) 폴링 → access_token + refresh_token
 *  4. /v1/chat/completions 등에 Authorization: Bearer {access_token}
 *
 * 알려진 동작 endpoint:
 *   ✅ /v1/chat/completions, /v1/responses, /v1/models
 *   ❓ /v1/images/generations (DALL-E), /v1/audio/transcriptions (Whisper)
 */

import { prisma } from '@/lib/db';
import { getCred } from '@/lib/credentials';

const OAUTH_BASE = 'https://auth.openai.com';
const API_BASE = 'https://api.openai.com';
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'; // Codex CLI client_id
const SCOPE = 'openid profile email offline_access';

export type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
};

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

/** 1단계: device_code 발급 요청 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const resp = await fetch(`${OAUTH_BASE}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPE,
    }).toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`device code 요청 실패 (${resp.status}): ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as DeviceCodeResponse;
}

/** 2단계: device_code 로 token 폴링. authorization_pending 동안 계속 호출. */
export async function pollToken(
  deviceCode: string
): Promise<{ status: 'pending' | 'ok' | 'expired' | 'denied'; token?: TokenResponse; error?: string }> {
  const resp = await fetch(`${OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    }).toString(),
  });

  if (resp.ok) {
    const token = (await resp.json()) as TokenResponse;
    return { status: 'ok', token };
  }

  let errBody: { error?: string; error_description?: string } = {};
  try {
    errBody = await resp.json();
  } catch {
    errBody = { error: 'parse_error' };
  }

  if (errBody.error === 'authorization_pending') return { status: 'pending' };
  if (errBody.error === 'slow_down') return { status: 'pending' };
  if (errBody.error === 'expired_token') return { status: 'expired' };
  if (errBody.error === 'access_denied') return { status: 'denied' };
  return { status: 'denied', error: errBody.error_description ?? errBody.error };
}

/** Refresh token 으로 새 access_token 받기 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const resp = await fetch(`${OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`token refresh 실패 (${resp.status}): ${text.slice(0, 200)}`);
  }
  return (await resp.json()) as TokenResponse;
}

/** DB 에서 유효한 access_token 가져옴. 만료 임박이면 자동 refresh. */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const row = await prisma.openAIOAuth.findUnique({ where: { id: 'default' } });
    if (!row) return null;

    const now = Date.now();
    const expMs = row.expiresAt.getTime();
    // 60초 여유 두고 refresh
    if (expMs > now + 60_000) return row.accessToken;

    if (!row.refreshToken) return null;
    try {
      const refreshed = await refreshAccessToken(row.refreshToken);
      const newExp = new Date(Date.now() + refreshed.expires_in * 1000);
      await prisma.openAIOAuth.update({
        where: { id: 'default' },
        data: {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? row.refreshToken,
          expiresAt: newExp,
        },
      });
      return refreshed.access_token;
    } catch {
      return null;
    }
  } catch {
    /* DB 미마이그레이션 */
    return null;
  }
}

/** 토큰 저장 (device flow 완료 시) */
export async function storeToken(token: TokenResponse, accountEmail?: string) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  await prisma.openAIOAuth.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt,
      accountEmail: accountEmail ?? null,
    },
    update: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt,
      accountEmail: accountEmail ?? null,
    },
  });
}

/** OAuth 연결 해제 */
export async function clearToken() {
  await prisma.openAIOAuth.deleteMany({ where: { id: 'default' } });
}

/**
 * OpenAI API 호출 — OAuth 우선, 실패 시 API key fallback.
 *
 * @param path - '/v1/chat/completions' 같은 endpoint path
 * @param init - fetch options (body, method 등)
 * @param opts.forceApiKey - true 면 OAuth 안 쓰고 바로 API key (DALL-E/Whisper 처럼 OAuth 미지원 확실한 경우)
 */
export async function openaiFetch(
  path: string,
  init: RequestInit = {},
  opts: { forceApiKey?: boolean } = {}
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  // 1. OAuth 시도
  if (!opts.forceApiKey) {
    const token = await getValidAccessToken();
    if (token) {
      const resp = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
      // 401/403 만 API key fallback. 다른 에러 (400, 429, 500) 는 그대로 반환.
      if (resp.status !== 401 && resp.status !== 403) return resp;
    }
  }

  // 2. API key fallback
  const apiKey = await getCred('OPENAI_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: { code: 'NO_AUTH', message: 'OAuth 토큰 없음 + OPENAI_API_KEY 미등록' },
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${apiKey}`,
    },
  });
}

/** 현재 인증 상태 조회 (UI 표시용) */
export async function getAuthStatus(): Promise<{
  oauth: { connected: boolean; email: string | null; expiresAt: string | null };
  apiKey: { set: boolean };
}> {
  let oauth = { connected: false, email: null as string | null, expiresAt: null as string | null };
  try {
    const row = await prisma.openAIOAuth.findUnique({ where: { id: 'default' } });
    if (row) {
      oauth = {
        connected: true,
        email: row.accountEmail,
        expiresAt: row.expiresAt.toISOString(),
      };
    }
  } catch {
    /* table missing */
  }
  const apiKey = await getCred('OPENAI_API_KEY');
  return { oauth, apiKey: { set: !!apiKey } };
}
