'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addChannelAction } from '../actions';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';
type Kind = 'REFERENCE' | 'SOURCE';
type Folder = { id: string; name: string };

const PLATFORM_LABEL: Record<Platform, string> = {
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  XIAOHONGSHU: '샤오홍수',
  DOUYIN: '도우인',
};

function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0] : '';
}

function detectPlatform(input: string): Platform {
  const s = input.toLowerCase();
  if (/youtu\.?be|youtube\.com/.test(s)) return 'YOUTUBE';
  if (/tiktok\.com/.test(s)) return 'TIKTOK';
  if (/instagram\.com/.test(s)) return 'INSTAGRAM';
  if (/xiaohongshu\.com|xhslink/.test(s)) return 'XIAOHONGSHU';
  if (/douyin\.com|iesdouyin/.test(s)) return 'DOUYIN';
  return 'YOUTUBE';
}

export function ChannelShareClient({ folders }: { folders: Folder[] }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">
          로딩 중…
        </div>
      }
    >
      <ShareInner folders={folders} />
    </Suspense>
  );
}

function ShareInner({ folders }: { folders: Folder[] }) {
  const router = useRouter();
  const params = useSearchParams();

  const sharedText = useMemo(() => {
    const direct = params.get('url') ?? '';
    if (direct) return direct;
    const text = params.get('text') ?? '';
    const title = params.get('title') ?? '';
    return extractUrl(text) || extractUrl(title) || text || title;
  }, [params]);

  const [input, setInput] = useState('');
  const [platform, setPlatform] = useState<Platform>('YOUTUBE');
  const [folderId, setFolderId] = useState<string>('');
  const [kind, setKind] = useState<Kind>('REFERENCE');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 초기 진입: 공유받은 URL/텍스트 자동 입력 + 플랫폼 추정
  useEffect(() => {
    if (sharedText) {
      setInput(sharedText);
      setPlatform(detectPlatform(sharedText));
    }
  }, [sharedText]);

  // 입력 바뀔 때마다 플랫폼 자동 추정 (사용자가 명시적으로 바꾸기 전까지)
  const [platformLocked, setPlatformLocked] = useState(false);
  useEffect(() => {
    if (!platformLocked && input) {
      setPlatform(detectPlatform(input));
    }
  }, [input, platformLocked]);

  // 마지막 선택 폴더/종류 기억
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lastFolder = localStorage.getItem('channels-share-folder');
    const lastKind = localStorage.getItem('channels-share-kind');
    if (lastFolder && folders.some((f) => f.id === lastFolder)) {
      setFolderId(lastFolder);
    } else if (folders[0]) {
      setFolderId(folders[0].id);
    }
    if (lastKind === 'SOURCE' || lastKind === 'REFERENCE') {
      setKind(lastKind);
    }
  }, [folders]);

  const submit = async () => {
    if (!input.trim() || !folderId) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('input', input.trim());
      fd.set('folderId', folderId);
      fd.set('platform', platform);
      fd.set('kind', kind);
      const r = await addChannelAction(fd);
      if (r.ok) {
        localStorage.setItem('channels-share-folder', folderId);
        localStorage.setItem('channels-share-kind', kind);
        const folderName = folders.find((f) => f.id === folderId)?.name ?? '폴더';
        setDone(`"${folderName}" 에 ${kind === 'SOURCE' ? '원본 소스' : '레퍼런스'} 채널 추가됨`);
        setInput('');
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (folders.length === 0) {
    return (
      <div className="mx-auto max-w-md p-5">
        <h1 className="mb-2 text-lg font-bold">에셋 채널 빠른 추가</h1>
        <div className="rounded-md border border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
          폴더가 없습니다.{' '}
          <a href="/folders" className="underline">
            먼저 폴더를 만드세요
          </a>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-5">
      <h1 className="mb-1 text-lg font-bold">에셋 채널 빠른 추가</h1>
      <p className="mb-5 text-xs text-muted-foreground">
        공유받은 URL 또는 핸들을 폴더에 추가합니다
      </p>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold">
            채널 URL 또는 핸들 (@xxx)
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://youtube.com/@xxx  또는  @xxx"
            inputMode="url"
            autoComplete="off"
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold">플랫폼</span>
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value as Platform);
              setPlatformLocked(true);
            }}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            {Object.entries(PLATFORM_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold">종류</span>
          <div className="grid grid-cols-2 gap-2">
            {(['REFERENCE', 'SOURCE'] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={
                  'h-11 rounded-md border text-sm font-semibold ' +
                  (kind === k
                    ? k === 'SOURCE'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                    : 'border-border/60 bg-background text-muted-foreground')
                }
              >
                {k === 'SOURCE' ? '원본 소스' : '레퍼런스'}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold">폴더 (카테고리)</span>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={submit}
          disabled={submitting || !input.trim() || !folderId}
          className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {submitting ? '추가 중…' : '+ 채널 추가'}
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
                onClick={() => router.push('/channels')}
                className="h-8 flex-1 rounded border bg-background text-[11px]"
              >
                채널 목록 보기
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
    </div>
  );
}
