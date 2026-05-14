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

type CaptionPos = 'top' | 'middle' | 'bottom';
type CaptionBgStyle = 'gradient' | 'box' | 'plain';

type VideoTemplate = {
  id: string;
  label: string;
  emoji: string;
  /** 이미지 없을 때 배경 그라데이션 */
  bgFrom: string;
  bgTo: string;
  captionPos: CaptionPos;
  captionBgStyle: CaptionBgStyle;
  /** box 스타일일 때 박스 배경색 (rgba) */
  captionBoxColor: string;
  captionTextColor: string;
  /** 캔버스 1280px 기준 폰트 크기 */
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  /** 텍스트 그림자 (Canvas shadowColor / blur / offsetY) */
  shadowColor: string;
  shadowBlur: number;
  /** 위·아래 검은 letterbox 바 */
  letterbox: boolean;
  /** 텍스트 외곽선 두께 (0 이면 안 그림) */
  strokeWidth: number;
  strokeColor: string;
};

const TEMPLATES: VideoTemplate[] = [
  {
    id: 'classic', label: '클래식', emoji: '🎬',
    bgFrom: '#334155', bgTo: '#0f172a',
    captionPos: 'bottom', captionBgStyle: 'gradient',
    captionBoxColor: 'rgba(0,0,0,0.85)', captionTextColor: '#ffffff',
    fontSize: 44, fontWeight: 700, fontFamily: '"Noto Sans KR", sans-serif',
    shadowColor: 'rgba(0,0,0,0.85)', shadowBlur: 12,
    letterbox: false, strokeWidth: 0, strokeColor: '#000000',
  },
  {
    id: 'impact', label: '임팩트', emoji: '💥',
    bgFrom: '#0a0a0a', bgTo: '#0a0a0a',
    captionPos: 'middle', captionBgStyle: 'plain',
    captionBoxColor: 'rgba(0,0,0,0)', captionTextColor: '#ffffff',
    fontSize: 64, fontWeight: 900, fontFamily: 'Oswald, "Noto Sans KR", sans-serif',
    shadowColor: 'rgba(0,0,0,0.95)', shadowBlur: 20,
    letterbox: false, strokeWidth: 4, strokeColor: '#000000',
  },
  {
    id: 'neon', label: '네온', emoji: '🌃',
    bgFrom: '#1e1b4b', bgTo: '#312e81',
    captionPos: 'bottom', captionBgStyle: 'plain',
    captionBoxColor: 'rgba(0,0,0,0)', captionTextColor: '#22d3ee',
    fontSize: 50, fontWeight: 800, fontFamily: '"Noto Sans KR", sans-serif',
    shadowColor: '#22d3ee', shadowBlur: 28,
    letterbox: false, strokeWidth: 2, strokeColor: '#082f49',
  },
  {
    id: 'note', label: '노트', emoji: '📝',
    bgFrom: '#fef3c7', bgTo: '#fde68a',
    captionPos: 'middle', captionBgStyle: 'plain',
    captionBoxColor: 'rgba(0,0,0,0)', captionTextColor: '#1f2937',
    fontSize: 48, fontWeight: 400, fontFamily: '"Nanum Pen Script", cursive',
    shadowColor: 'rgba(0,0,0,0.0)', shadowBlur: 0,
    letterbox: false, strokeWidth: 0, strokeColor: '#000000',
  },
  {
    id: 'card', label: '카드', emoji: '🪪',
    bgFrom: '#0f172a', bgTo: '#1e293b',
    captionPos: 'middle', captionBgStyle: 'box',
    captionBoxColor: 'rgba(255,255,255,0.92)', captionTextColor: '#0f172a',
    fontSize: 40, fontWeight: 700, fontFamily: '"Noto Sans KR", sans-serif',
    shadowColor: 'rgba(0,0,0,0)', shadowBlur: 0,
    letterbox: false, strokeWidth: 0, strokeColor: '#000000',
  },
  {
    id: 'cinema', label: '시네마', emoji: '🎞️',
    bgFrom: '#000000', bgTo: '#000000',
    captionPos: 'bottom', captionBgStyle: 'plain',
    captionBoxColor: 'rgba(0,0,0,0)', captionTextColor: '#ffffff',
    fontSize: 38, fontWeight: 500, fontFamily: '"Noto Sans KR", sans-serif',
    shadowColor: 'rgba(0,0,0,0.9)', shadowBlur: 14,
    letterbox: true, strokeWidth: 0, strokeColor: '#000000',
  },
  {
    id: 'youtube', label: '유튜브 자막', emoji: '▶️',
    bgFrom: '#1f2937', bgTo: '#111827',
    captionPos: 'bottom', captionBgStyle: 'box',
    captionBoxColor: 'rgba(0,0,0,0.78)', captionTextColor: '#ffffff',
    fontSize: 42, fontWeight: 700, fontFamily: '"Roboto", "Noto Sans KR", sans-serif',
    shadowColor: 'rgba(0,0,0,0)', shadowBlur: 0,
    letterbox: false, strokeWidth: 0, strokeColor: '#000000',
  },
  {
    id: 'top-bold', label: '상단 굵게', emoji: '⬆️',
    bgFrom: '#7c2d12', bgTo: '#dc2626',
    captionPos: 'top', captionBgStyle: 'gradient',
    captionBoxColor: 'rgba(0,0,0,0.7)', captionTextColor: '#fff7ed',
    fontSize: 48, fontWeight: 800, fontFamily: '"Noto Sans KR", sans-serif',
    shadowColor: 'rgba(0,0,0,0.9)', shadowBlur: 12,
    letterbox: false, strokeWidth: 0, strokeColor: '#000000',
  },
];

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
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<string>('');
  const [template, setTemplate] = useState<VideoTemplate>(TEMPLATES[0]);

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

  const renderSceneToPng = async (
    scene: Scene,
    tpl: VideoTemplate
  ): Promise<Blob> => {
    // 9:16, 720x1280 캔버스에 이미지+자막 직접 그림 (html2canvas 없이 순수 canvas)
    const W = 720;
    const H = 1280;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context 실패');

    // 배경
    if (scene.imageUrl) {
      const img = await loadImage(scene.imageUrl);
      const r = Math.max(W / img.width, H / img.height);
      const w = img.width * r;
      const h = img.height * r;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    } else {
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, tpl.bgFrom);
      grd.addColorStop(1, tpl.bgTo);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    }

    // letterbox 검은 바
    if (tpl.letterbox) {
      ctx.fillStyle = '#000000';
      const barH = H * 0.12;
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }

    const fontSize = tpl.fontSize;
    ctx.font = `${tpl.fontWeight} ${fontSize}px ${tpl.fontFamily}`;
    const maxWidth = W * 0.86;
    const lines = wrapText(ctx, scene.caption, maxWidth);
    const lineHeight = fontSize * 1.3;
    const blockH = lines.length * lineHeight;

    // 자막 위치 계산 (top/middle/bottom)
    let baseY: number;
    if (tpl.captionPos === 'top') {
      baseY = (tpl.letterbox ? H * 0.12 : 0) + 80;
    } else if (tpl.captionPos === 'middle') {
      baseY = (H - blockH) / 2;
    } else {
      baseY = H - 80 - blockH;
    }

    // 캡션 배경 (gradient / box / plain)
    if (tpl.captionBgStyle === 'gradient') {
      const gradH = H * 0.4;
      if (tpl.captionPos === 'top') {
        const g = ctx.createLinearGradient(0, 0, 0, gradH);
        g.addColorStop(0, 'rgba(0,0,0,0.85)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, gradH);
      } else {
        const gradY = H - gradH;
        const g = ctx.createLinearGradient(0, gradY, 0, H);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(0, gradY, W, gradH);
      }
    } else if (tpl.captionBgStyle === 'box') {
      const padX = 36;
      const padY = 24;
      const boxX = (W - maxWidth) / 2 - padX;
      const boxY = baseY - padY;
      const boxW = maxWidth + padX * 2;
      const boxH = blockH + padY * 2;
      ctx.fillStyle = tpl.captionBoxColor;
      roundRect(ctx, boxX, boxY, boxW, boxH, 16);
      ctx.fill();
    }

    // 자막 텍스트
    ctx.fillStyle = tpl.captionTextColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = tpl.shadowColor;
    ctx.shadowBlur = tpl.shadowBlur;
    ctx.shadowOffsetY = tpl.shadowBlur > 0 ? 3 : 0;

    lines.forEach((line, i) => {
      const y = baseY + i * lineHeight;
      if (tpl.strokeWidth > 0) {
        ctx.lineWidth = tpl.strokeWidth;
        ctx.strokeStyle = tpl.strokeColor;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, W / 2, y);
      }
      ctx.fillText(line, W / 2, y);
    });

    // shadow 초기화 (이후 다른 그림 영향 안 받게)
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('toBlob 실패'));
      }, 'image/png');
    });
  };

  const onExportMp4 = async () => {
    if (!audioFile || scenes.length === 0) return;
    setExportErr(null);
    setExporting(true);
    setExportProgress('ffmpeg 로딩 중…');
    try {
      const [ffmpegMod, utilMod] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const { FFmpeg } = ffmpegMod;
      const ff = new FFmpeg();
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      await ff.load({
        coreURL: await utilMod.toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          'text/javascript'
        ),
        wasmURL: await utilMod.toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          'application/wasm'
        ),
      });

      // 1. audio 파일 작성
      setExportProgress('오디오 작성 중…');
      const audioExt = audioFile.name.split('.').pop()?.toLowerCase() || 'mp3';
      const audioName = `audio.${audioExt}`;
      const audioAb = await audioFile.arrayBuffer();
      await ff.writeFile(audioName, new Uint8Array(audioAb));

      // 2. 각 씬을 PNG로 렌더링 + 작성
      const concatLines: string[] = [];
      for (let i = 0; i < scenes.length; i++) {
        setExportProgress(`씬 ${i + 1}/${scenes.length} 렌더링…`);
        const s = scenes[i];
        const blob = await renderSceneToPng(s, template);
        const name = `scene_${String(i + 1).padStart(3, '0')}.png`;
        const ab = await blob.arrayBuffer();
        await ff.writeFile(name, new Uint8Array(ab));
        const dur = Math.max(0.1, s.end - s.start);
        concatLines.push(`file '${name}'`);
        concatLines.push(`duration ${dur.toFixed(3)}`);
      }
      // concat demuxer 는 마지막 파일을 한 번 더 명시해야 함
      concatLines.push(`file '${`scene_${String(scenes.length).padStart(3, '0')}.png`}'`);
      await ff.writeFile(
        'concat.txt',
        new TextEncoder().encode(concatLines.join('\n'))
      );

      // 3. ffmpeg 실행
      setExportProgress('영상 렌더링 중… (수십초 소요)');
      await ff.exec([
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        'concat.txt',
        '-i',
        audioName,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-vf',
        'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:a',
        'aac',
        '-shortest',
        'out.mp4',
      ]);

      setExportProgress('마무리 중…');
      const data = await ff.readFile('out.mp4');
      const buf =
        typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const mp4 = new Blob([new Uint8Array(buf as Uint8Array)], {
        type: 'video/mp4',
      });
      const url = URL.createObjectURL(mp4);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audio-shorts-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr((e as Error).message);
    } finally {
      setExporting(false);
      setExportProgress('');
    }
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
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
              title="OpenAI Whisper 로 자동 전사 + 씬 분할"
            >
              {transcribing ? '전사 중…' : '✨ AI 자동 전사 + 씬 분할'}
            </button>
            <button
              onClick={onExportMp4}
              disabled={!audioFile || scenes.length === 0 || exporting}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              title="ffmpeg.wasm 으로 오디오+이미지+자막 합성 MP4 (수십초 소요)"
            >
              {exporting ? `… ${exportProgress}` : '↓ MP4 export'}
            </button>
          </div>
        </header>

        {exportErr && (
          <div className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            ⚠ {exportErr}
          </div>
        )}

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
              <Preview scene={currentScene} tpl={template} />
            </div>
          </div>

          <aside className="w-80 shrink-0 overflow-auto border-l bg-background">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">템플릿 (영상 전체)</h2>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t)}
                  title={t.label}
                  className={cn(
                    'group relative aspect-[9/16] overflow-hidden rounded border-2 transition',
                    template.id === t.id
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent hover:border-foreground/40'
                  )}
                  style={{
                    background: `linear-gradient(135deg, ${t.bgFrom}, ${t.bgTo})`,
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-lg">
                    {t.emoji}
                  </span>
                  <span
                    className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-center text-[9.5px] font-semibold"
                    style={{ color: t.captionTextColor }}
                  >
                    {t.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="border-b border-t px-4 py-3">
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

function Preview({
  scene,
  tpl,
}: {
  scene: Scene | undefined;
  tpl: VideoTemplate;
}) {
  if (!scene) {
    return (
      <div className="flex aspect-[9/16] w-72 items-center justify-center rounded-xl border border-dashed bg-secondary text-center text-xs text-muted-foreground">
        씬 없음
      </div>
    );
  }

  // 미리보기는 720→288 (40%) 스케일. ratio = 0.4
  const r = 0.4;
  const fontSizePx = Math.round(tpl.fontSize * r);
  const justify =
    tpl.captionPos === 'top'
      ? 'flex-start'
      : tpl.captionPos === 'bottom'
        ? 'flex-end'
        : 'center';

  const captionShadow =
    tpl.shadowBlur > 0
      ? `0 ${Math.max(1, tpl.shadowBlur * 0.2)}px ${tpl.shadowBlur * 0.5}px ${tpl.shadowColor}`
      : 'none';

  const captionStroke =
    tpl.strokeWidth > 0
      ? {
          WebkitTextStroke: `${tpl.strokeWidth * 0.4}px ${tpl.strokeColor}`,
          paintOrder: 'stroke fill' as const,
        }
      : {};

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
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${tpl.bgFrom}, ${tpl.bgTo})`,
          }}
        />
      )}

      {tpl.letterbox && (
        <>
          <div className="absolute inset-x-0 top-0 h-[12%] bg-black" />
          <div className="absolute inset-x-0 bottom-0 h-[12%] bg-black" />
        </>
      )}

      {tpl.captionBgStyle === 'gradient' && tpl.captionPos === 'bottom' && (
        <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-black/85 to-transparent" />
      )}
      {tpl.captionBgStyle === 'gradient' && tpl.captionPos === 'top' && (
        <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-black/85 to-transparent" />
      )}

      <div
        className="absolute inset-0 flex flex-col px-3 py-3"
        style={{ justifyContent: justify }}
      >
        <p
          className="text-center leading-tight"
          style={{
            color: tpl.captionTextColor,
            fontWeight: tpl.fontWeight,
            fontFamily: tpl.fontFamily,
            fontSize: `${fontSizePx}px`,
            textShadow: captionShadow,
            ...captionStroke,
            ...(tpl.captionBgStyle === 'box'
              ? {
                  background: tpl.captionBoxColor,
                  display: 'inline-block',
                  alignSelf: 'center',
                  padding: '8px 14px',
                  borderRadius: 8,
                }
              : {}),
          }}
        >
          {scene.caption}
        </p>
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('이미지 로드 실패: ' + String(e)));
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  // 한국어/영어 혼용: 공백 기준 단어 분리. 너무 긴 단어는 글자 단위 폴백.
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (ctx.measureText(cand).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = cand;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [''];
}
