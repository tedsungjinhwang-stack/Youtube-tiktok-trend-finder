'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password, next }),
        });
        const j = await r.json();
        if (!j.ok) {
          setError(j.error ?? '로그인 실패');
          return;
        }
        router.replace(j.next ?? '/');
        router.refresh();
      } catch (e: any) {
        setError(e?.message ?? '네트워크 오류');
      }
    });
  };

  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center"
      >
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background">
          <span className="text-lg font-black">T</span>
        </div>
        <h1 className="text-[18px] font-bold tracking-tight">Trend Finder</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          비밀번호 보호 — 본인만 접근 가능
        </p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          required
          disabled={isPending}
          className="mt-5 w-full rounded-lg border bg-background/40 px-4 py-2.5 text-center text-[14px] outline-none focus:border-foreground/40 disabled:opacity-50"
        />

        {error && (
          <div className="mt-2 text-[12px] text-warning">{error}</div>
        )}

        <button
          type="submit"
          disabled={isPending || !password}
          className="mt-3 w-full rounded-lg bg-foreground px-4 py-2.5 text-[14px] font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          {isPending ? '확인 중…' : '로그인'}
        </button>

        <p className="mt-3 text-[11.5px] text-muted-foreground">
          쿠키 30일 유지.
        </p>
      </form>
    </div>
  );
}
