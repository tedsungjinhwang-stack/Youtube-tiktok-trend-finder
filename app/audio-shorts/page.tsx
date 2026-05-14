'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Scene = {
  id: string;
  start: number; // seconds
  end: number;
  caption: string;
  imageUrl?: string; // data URL 또는 외부 URL
};

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function AudioShortsPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeErr, setTranscribeErr] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const selected = scenes.find((s) => s.id === selectedId) ?? null;
  const currentScene =
    scenes.find((s) => currentTime >= s.start && currentTime < s.end) ?? scenes[0];

  // 오디오 파일 → object URL
  useEffect(() => {
    if (!audioFile) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  // 재생 위치 추적
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('seeked', onTime);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('seeked', onTime);
    };
  }, [audioUrl]);

  const onTranscribe = async () => {
    if (!audioFile) return;
    setTranscribeErr(null);
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append('file', audioFile);
      const r = await fetch('/api/v1/audio/transcribe', {
        method: 'POST',
        body: fd,
      });
      const j = await r.json();
      if (!j.success) {
        setTranscribeErr(j.error?.message ?? '전사 실패');
        return;
      }
      const segments = (j.data.segments ?? []) as Array<{
        start: number;
        end: number;
        text: string;
      }>;
      if (segments.length === 0) {
        setTranscribeErr('전사 결과 비어있음');
        return;
      }
      const newScenes: Scene[] = segments.map((s) => ({
        id: makeId(),
        start: s.start,
        end: s.end,
        caption: s.text,
      }));
      setScenes(newScenes);
      setSelectedId(newScenes[0].id);
    } catch (e) {
      setTranscribeErr((e as Error).message);
    } finally {
      setTranscribing(false);
    }
  };

  const update = <K extends keyof Scene>(k: K, v: Scene[K]) => {
    if (!selectedId) return;
    setScenes((prev) =>
      prev.map((x) => (x.id === selectedId ? { ...x, [k]: v } : x))
    );
  };

  const seekTo = (t: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      setCurrentTime(t);
    }
  };

  const onUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        update('imageUrl', reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const mergeWithPrev = () => {
    if (!selectedId) return;
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === selectedId);
      if (idx <= 0) return prev;
      const merged = {
        ...prev[idx - 1],
        end: prev[idx].end,
        caption: `${prev[idx - 1].caption} ${prev[idx].caption}`.trim(),
      };
      const next = [...prev];
      next.splice(idx - 1, 2, merged);
      setSelectedId(merged.id);
      return next;
    });
  };

  const splitAtCurrent = () => {
    if (!selectedId || !selected) return;
    const t = currentTime;
    if (t <= selected.start || t >= selected.end) return;
    setScenes((prev) => {
      const idx = prev.findIndex((s) => s.id === selectedId);
      if (idx < 0) return prev;
      const a: Scene = { ...prev[idx], end: t };
      const b: Scene = {
        ...prev[idx],
        id: makeId(),
        start: t,
        caption: '',
      };
      const next = [...prev];
      next.splice(idx, 1, a, b);
      return next;
    });
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">군림보형 영상생성기</h1>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Beta
            </span>
            <span className="num text-xs text-muted-foreground">
              {scenes.length} 씬
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40">
              {audioFile ? '오디오 교체' : '오디오 업로드'}
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
            <button
              onClick={onTranscribe}
              disabled={!audioFile || transcribing}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              title="OpenAI Whisper 로 자동 전사 + 씬 분할"
            >
              {transcribing ? '전사 중…' : '✨ AI 자동 전사 + 씬 분할'}
            </button>
          </div>
        </header>

        {audioUrl && (
          <div className="border-b bg-background px-4 py-2">
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              className="w-full"
            />
          </div>
        )}

        {transcribeErr && (
          <div className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            ⚠ {transcribeErr}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-[420px] flex-col border-r">
            <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
              씬 타임라인
            </div>
            <div className="flex-1 overflow-auto">
              {scenes.length === 0 && (
                <div className="px-4 py-12 text-center text-xs text-muted-foreground">
                  오디오 업로드 후 전사 버튼을 누르면 씬이 자동 생성됩니다.
                </div>
              )}
              {scenes.map((s, i) => {
                const isCurrent =
                  currentTime >= s.start && currentTime < s.end;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSelectedId(s.id);
                      seekTo(s.start);
                    }}
                    className={cn(
                      'cursor-pointer border-b px-3 py-2 transition',
                      selectedId === s.id
                        ? 'bg-primary/15'
                        : isCurrent
                          ? 'bg-secondary/40'
                          : 'hover:bg-secondary/30'
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>#{i + 1}</span>
                      <span className="num">
                        {fmt(s.start)} → {fmt(s.end)}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[13px] leading-snug">
                      {s.caption || '(빈 캡션)'}
                    </div>
                    {s.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.imageUrl}
                        alt=""
                        className="mt-1.5 h-8 w-14 rounded object-cover"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden bg-secondary/30">
            <div className="border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
              미리보기
            </div>
            <div className="flex flex-1 items-center justify-center p-8">
              <Preview scene={currentScene} />
            </div>
          </div>

          <aside className="w-80 shrink-0 overflow-auto border-l bg-background">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">씬 편집</h2>
            </div>
            <div className="space-y-4 p-4">
              {!selected ? (
                <p className="text-xs text-muted-foreground">
                  타임라인에서 씬을 선택하세요.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-muted-foreground">시작</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selected.start.toFixed(2)}
                        onChange={(e) =>
                          update('start', Number(e.target.value))
                        }
                        className="mt-0.5 h-8 w-full rounded-md border bg-transparent px-2"
                      />
                    </div>
                    <div>
                      <label className="text-muted-foreground">끝</label>
                      <input
                        type="number"
                        step="0.01"
                        value={selected.end.toFixed(2)}
                        onChange={(e) =>
                          update('end', Number(e.target.value))
                        }
                        className="mt-0.5 h-8 w-full rounded-md border bg-transparent px-2"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      자막
                    </label>
                    <textarea
                      value={selected.caption}
                      onChange={(e) => update('caption', e.target.value)}
                      rows={4}
                      className="mt-1 w-full rounded-md border bg-transparent p-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      이미지
                    </label>
                    <div className="mt-1 flex flex-col gap-2">
                      {selected.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selected.imageUrl}
                          alt=""
                          className="h-32 w-full rounded-md object-cover"
                        />
                      )}
                      <label className="cursor-pointer rounded-md border bg-card px-3 py-1.5 text-center text-xs hover:border-foreground/40">
                        업로드
                        <input
                          type="file"
                          accept="image/*"
                          onChange={onUploadImage}
                          className="hidden"
                        />
                      </label>
                      {selected.imageUrl && (
                        <button
                          onClick={() => update('imageUrl', undefined)}
                          className="rounded-md border bg-background px-3 py-1.5 text-xs hover:bg-accent"
                        >
                          이미지 제거
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t pt-3">
                    <button
                      onClick={mergeWithPrev}
                      className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40"
                    >
                      ↑ 이전과 합치기
                    </button>
                    <button
                      onClick={splitAtCurrent}
                      className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40"
                      title="재생 헤드 위치에서 분할"
                    >
                      ✂ 현재 위치 분할
                    </button>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Preview({ scene }: { scene: Scene | undefined }) {
  if (!scene) {
    return (
      <div className="flex aspect-[9/16] w-72 items-center justify-center rounded-xl border border-dashed bg-secondary text-center text-xs text-muted-foreground">
        씬 없음
      </div>
    );
  }
  return (
    <div className="relative flex aspect-[9/16] w-72 overflow-hidden rounded-xl bg-black shadow-2xl">
      {scene.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={scene.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
        <p
          className="text-center text-[18px] font-bold leading-tight text-white"
          style={{
            textShadow: '0 2px 8px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.6)',
          }}
        >
          {scene.caption}
        </p>
      </div>
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}
