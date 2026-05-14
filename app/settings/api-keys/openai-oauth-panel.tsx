'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type AuthStatus = {
  oauth: { connected: boolean; email: string | null; expiresAt: string | null };
  apiKey: { set: boolean };
};

type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string | null;
  expires_in: number;
  interval: number;
};

export function OpenAIOAuthPanel() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [pollMsg, setPollMsg] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/openai/status', { cache: 'no-store' });
      const j = await r.json();
      if (j.success) setStatus(j.data);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadStatus]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startDeviceFlow = useCallback(async () => {
    setErr('');
    setPollMsg('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/openai/device', { method: 'POST' });
      const j = await r.json();
      if (!j.success) {
        setErr(j.error?.message ?? '발급 실패');
        setBusy(false);
        return;
      }
      const d = j.data as DeviceCode;
      setDevice(d);
      setPollMsg('브라우저에서 코드 입력 대기 중...');

      stopPolling();
      const intervalMs = Math.max(2, d.interval) * 1000;
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch('/api/auth/openai/poll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_code: d.device_code }),
          });
          const pj = await pr.json();
          if (!pj.success) {
            setErr(pj.error?.message ?? '폴링 실패');
            stopPolling();
            setBusy(false);
            return;
          }
          const s = pj.data?.status;
          if (s === 'ok') {
            setPollMsg('연결 완료!');
            stopPolling();
            setDevice(null);
            setBusy(false);
            await loadStatus();
          } else if (s === 'expired') {
            setErr('코드 만료. 다시 시도하세요.');
            stopPolling();
            setBusy(false);
          } else if (s === 'denied') {
            setErr('권한 거부됨.');
            stopPolling();
            setBusy(false);
          }
        } catch (e) {
          setErr((e as Error).message);
          stopPolling();
          setBusy(false);
        }
      }, intervalMs);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }, [loadStatus, stopPolling]);

  const cancelFlow = useCallback(() => {
    stopPolling();
    setDevice(null);
    setBusy(false);
    setPollMsg('');
  }, [stopPolling]);

  const disconnect = useCallback(async () => {
    if (!confirm('OAuth 연결을 해제할까요?')) return;
    try {
      await fetch('/api/auth/openai/status', { method: 'DELETE' });
      await loadStatus();
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [loadStatus]);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11.5px] leading-snug text-amber-300">
        ⚠️ <strong>TOS 회색지대 경고</strong>: 이 기능은 Codex CLI 의 OAuth 흐름을
        비공식 우회하여 ChatGPT 계정으로 OpenAI API 를 호출합니다. OpenAI 정책상
        명시적 허용이 아니며, 차단되거나 <strong>ChatGPT 계정이 정지될 수
        있습니다</strong>. 위험을 감수할 경우에만 사용하세요. 차단 시 API key 로
        자동 fallback 됩니다.
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px]">
          <div className="font-semibold">Sign in with ChatGPT (OAuth)</div>
          {status ? (
            status.oauth.connected ? (
              <div className="mt-0.5 text-[11.5px] text-emerald-400">
                연결됨{status.oauth.email ? ` · ${status.oauth.email}` : ''}
                {status.oauth.expiresAt
                  ? ` · 만료 ${new Date(status.oauth.expiresAt).toLocaleString()}`
                  : ''}
              </div>
            ) : (
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                미연결{status.apiKey.set ? ' (API key fallback 사용 가능)' : ''}
              </div>
            )
          ) : (
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              상태 확인 중...
            </div>
          )}
        </div>
        {status?.oauth.connected ? (
          <button
            type="button"
            onClick={disconnect}
            className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11.5px] text-red-300 hover:bg-red-500/20"
          >
            연결 해제
          </button>
        ) : (
          <button
            type="button"
            onClick={startDeviceFlow}
            disabled={busy}
            className="rounded bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background disabled:opacity-50"
          >
            {busy ? '진행 중...' : 'ChatGPT 로 로그인'}
          </button>
        )}
      </div>

      {device && (
        <div className="space-y-2 rounded border bg-background/40 p-2.5">
          <div className="text-[12px]">
            <div className="text-muted-foreground">아래 코드를 브라우저에서 입력하세요:</div>
            <div className="mt-1 font-mono text-[18px] font-bold tracking-widest text-foreground">
              {device.user_code}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={device.verification_uri_complete ?? device.verification_uri}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-foreground px-2.5 py-1 text-[11.5px] font-semibold text-background"
            >
              ↗ {device.verification_uri_complete ? '바로 인증 페이지 열기' : '인증 페이지 열기'}
            </a>
            <button
              type="button"
              onClick={cancelFlow}
              className="rounded border px-2.5 py-1 text-[11.5px]"
            >
              취소
            </button>
          </div>
          {pollMsg && (
            <div className="text-[11.5px] text-muted-foreground">{pollMsg}</div>
          )}
        </div>
      )}

      {err && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[11.5px] text-red-300">
          {err}
        </div>
      )}
    </div>
  );
}
