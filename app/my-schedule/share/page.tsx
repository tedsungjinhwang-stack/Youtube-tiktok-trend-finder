'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type MyChannel = {
  id: string;
  name: string;
  category: string | null;
  isActive: boolean;
};

// 공유받은 text 안에 URL 이 섞여있을 수 있어 추출.
function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0] : '';
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">
          로딩 중…
        </div>
      }
    >
      <ShareInner />
    </Suspense>
  );
}

function ShareInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [channels, setChannels] = useState<MyChannel[]>([]);
  const [channelId, setChannelId] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sharedUrl = useMemo(() => {
    const direct = params.get('url') ?? '';
    if (direct) return direct;
    const text = params.get('text') ?? '';
    const title = params.get('title') ?? '';
    return extractUrl(text) || extractUrl(title);
  }, [params]);

  useEffect(() => {
    if (sharedUrl) setUrl(sharedUrl);
  }, [sharedUrl]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/v1/my-schedule/channels', { cache: 'no-store' });
        const j = await r.json();
        if (j.success) {
          const active: MyChannel[] = (j.data ?? []).filter(
            (c: MyChannel) => c.isActive,
          );
          setChannels(active);
          // 마지막 선택 채널 기억
          const last = typeof window !== 'undefined'
            ? localStorage.getItem('share-last-channel')
            : null;
          if (last && active.some((c) => c.id === last)) setChannelId(last);
          else if (active[0]) setChannelId(active[0].id);
        } else {
          setError(j.error?.message ?? '채널 목록 로드 실패');
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async () => {
    if (!channelId || !url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/v1/my-schedule/channels/${channelId}/materials`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim() }),
        },
      );
      const j = await r.json();
      if (j.success) {
        localStorage.setItem('share-last-channel', channelId);
        const name =
          channels.find((c) => c.id === channelId)?.name ?? '채널';
        setDone(`"${name}" 에 추가됨`);
        setUrl('');
      } else {
        setError(j.error?.message ?? '실패');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-5">
      <h1 className="mb-1 text-lg font-bold">소재 빠른 추가</h1>
      <p className="mb-5 text-xs text-muted-foreground">
        공유받은 URL 을 채널의 소재 풀에 추가합니다 (최대 3개 / FIFO)
      </p>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          로딩 중…
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
          활성 채널이 없습니다.{' '}
          <a href="/my-schedule" className="underline">
            먼저 채널을 추가하세요
          </a>
          .
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              inputMode="url"
              autoComplete="off"
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold">채널</span>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.category ? ` · ${c.category}` : ''}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={submit}
            disabled={submitting || !url.trim() || !channelId}
            className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {submitting ? '추가 중…' : '+ 소재 추가'}
          </button>

          {done && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-50 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              ✓ {done}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setDone(null)}
                  className="h-8 flex-1 rounded border bg-background text-[11px]"
                >
                  하나 더 추가
                </button>
                <button
                  onClick={() => router.push('/my-schedule')}
                  className="h-8 flex-1 rounded border bg-background text-[11px]"
                >
                  목록 보기
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-200">
              ⚠️ {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
