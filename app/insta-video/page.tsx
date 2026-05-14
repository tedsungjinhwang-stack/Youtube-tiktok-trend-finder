'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type BgKind = 'solid' | 'gradient' | 'image';

type SlideData = {
  id: string;
  title: string;
  body: string;
  /** 9:16 캔버스 가로 px (export 시 baseline) */
  width: number;
  bgKind: BgKind;
  bgColor1: string;
  bgColor2: string;
  bgImageUrl?: string;
  textColor: string;
  fontSize: number;
  titleSize: number;
  align: 'center' | 'left' | 'right';
  vertical: 'top' | 'middle' | 'bottom';
  fontFamily: FontId;
};

type FontId = 'noto-kr' | 'noto-jp' | 'roboto' | 'gowun' | 'nanum-pen' | 'oswald';

const FONTS: { id: FontId; label: string; stack: string }[] = [
  { id: 'noto-kr', label: '노토 산스 KR', stack: '"Noto Sans KR", sans-serif' },
  { id: 'noto-jp', label: '노토 산스 JP', stack: '"Noto Sans JP", sans-serif' },
  { id: 'roboto', label: 'Roboto', stack: 'Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'gowun', label: '고운 돋움', stack: '"Gowun Dodum", "Noto Sans KR", sans-serif' },
  { id: 'nanum-pen', label: '나눔 펜', stack: '"Nanum Pen Script", cursive' },
  { id: 'oswald', label: 'Oswald', stack: 'Oswald, "Noto Sans KR", sans-serif' },
];

const PRESET_GRADIENTS: { c1: string; c2: string }[] = [
  { c1: '#ff4d6d', c2: '#ff8a3c' },
  { c1: '#7c3aed', c2: '#ec4899' },
  { c1: '#0ea5e9', c2: '#22d3ee' },
  { c1: '#16a34a', c2: '#84cc16' },
  { c1: '#f59e0b', c2: '#ef4444' },
  { c1: '#0f172a', c2: '#1e3a8a' },
];

const SOLID_COLORS = [
  '#0f172a', '#1e293b', '#334155', '#ffffff',
  '#fef3c7', '#fee2e2', '#dbeafe', '#dcfce7',
  '#FF5722', '#E91E63', '#9C27B0', '#2196F3',
  '#009688', '#4CAF50', '#FFC107', '#607D8B',
];

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeDefaultSlide(): SlideData {
  return {
    id: makeId(),
    title: '여기에 제목',
    body: '여기에 본문을 입력하세요. 한 줄에 너무 길지 않게 나눠 쓰면 더 잘 읽혀요.',
    width: 540,
    bgKind: 'gradient',
    bgColor1: '#ff4d6d',
    bgColor2: '#ff8a3c',
    textColor: '#ffffff',
    fontSize: 28,
    titleSize: 44,
    align: 'center',
    vertical: 'middle',
    fontFamily: 'noto-kr',
  };
}

export default function InstaVideoPage() {
  const [list, setList] = useState<SlideData[]>(() => [makeDefaultSlide()]);
  const [selectedId, setSelectedId] = useState(() => list[0].id);
  const [exporting, setExporting] = useState<string | null>(null);
  const refsMap = useRef(new Map<string, HTMLDivElement | null>());
  const [secondsPerSlide, setSecondsPerSlide] = useState(3);
  const [aiTopic, setAiTopic] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const selected = list.find((x) => x.id === selectedId) ?? list[0];

  const update = <K extends keyof SlideData>(k: K, v: SlideData[K]) => {
    setList((prev) =>
      prev.map((x) => (x.id === selectedId ? { ...x, [k]: v } : x))
    );
  };

  const addNew = () => {
    const fresh = makeDefaultSlide();
    setList((prev) => [...prev, fresh]);
    setSelectedId(fresh.id);
  };

  const duplicateSelected = () => {
    const dup = { ...selected, id: makeId() };
    setList((prev) => [...prev, dup]);
    setSelectedId(dup.id);
  };

  const removeSelected = () => {
    if (list.length <= 1) return;
    setList((prev) => prev.filter((x) => x.id !== selectedId));
  };

  const move = (dir: -1 | 1) => {
    setList((prev) => {
      const idx = prev.findIndex((x) => x.id === selectedId);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const onAiGenerate = async () => {
    setAiError(null);
    if (!aiTopic.trim()) {
      setAiError('주제를 입력하세요');
      return;
    }
    setAiBusy(true);
    try {
      const r = await fetch('/api/v1/insta/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: aiTopic,
          count: aiCount,
          language: '한국어',
        }),
      });
      const j = await r.json();
      if (!j.success) {
        setAiError(j.error?.message ?? '생성 실패');
        return;
      }
      const slides = (j.data ?? []) as Array<{ title: string; body: string }>;
      if (slides.length === 0) {
        setAiError('생성된 슬라이드가 없습니다');
        return;
      }
      // 현재 첫 슬라이드의 스타일을 베이스로 새 슬라이드 생성 (배경/폰트 일관성)
      const base = list[0];
      const fresh: SlideData[] = slides.map((s) => ({
        ...base,
        id: makeId(),
        title: s.title,
        body: s.body,
      }));
      setList(fresh);
      setSelectedId(fresh[0].id);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };

  const captureSlide = async (
    node: HTMLDivElement,
    h2c: typeof import('html2canvas').default
  ): Promise<Blob> => {
    const canvas = await h2c(node, { backgroundColor: null, scale: 2 });
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, 'image/png')
    );
    if (!blob) throw new Error('blob 생성 실패');
    return blob;
  };

  const onExportSelectedPng = async () => {
    const node = refsMap.current.get(selectedId);
    if (!node) return;
    setExporting('png');
    try {
      const h2c = (await import('html2canvas')).default;
      const blob = await captureSlide(node, h2c);
      downloadBlob(blob, `slide-${selectedId}.png`);
    } catch (e) {
      alert('PNG 실패: ' + (e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const onExportAllZip = async () => {
    setExporting('zip');
    try {
      const [{ default: h2c }, { default: JSZip }] = await Promise.all([
        import('html2canvas'),
        import('jszip'),
      ]);
      const zip = new JSZip();
      for (let i = 0; i < list.length; i++) {
        const node = refsMap.current.get(list[i].id);
        if (!node) continue;
        const blob = await captureSlide(node, h2c);
        zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `slides-${Date.now()}.zip`);
    } catch (e) {
      alert('ZIP 실패: ' + (e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const onExportMp4 = async () => {
    setExporting('mp4');
    try {
      const [{ default: h2c }, ffmpegMod, utilMod] = await Promise.all([
        import('html2canvas'),
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);
      const { FFmpeg } = ffmpegMod;
      const ff = new FFmpeg();
      ff.on('log', () => {
        /* silence */
      });
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

      for (let i = 0; i < list.length; i++) {
        const node = refsMap.current.get(list[i].id);
        if (!node) continue;
        const blob = await captureSlide(node, h2c);
        const ab = await blob.arrayBuffer();
        await ff.writeFile(
          `frame_${String(i + 1).padStart(3, '0')}.png`,
          new Uint8Array(ab)
        );
      }

      // libx264 yuv420p for max compatibility; 1 / N fps so each frame = N seconds
      await ff.exec([
        '-framerate',
        `1/${secondsPerSlide}`,
        '-i',
        'frame_%03d.png',
        '-c:v',
        'libx264',
        '-r',
        '30',
        '-pix_fmt',
        'yuv420p',
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        'out.mp4',
      ]);

      const data = await ff.readFile('out.mp4');
      const buf =
        typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const mp4Blob = new Blob([new Uint8Array(buf as Uint8Array)], {
        type: 'video/mp4',
      });
      downloadBlob(mp4Blob, `insta-${Date.now()}.mp4`);
    } catch (e) {
      alert(
        'MP4 실패: ' +
          (e as Error).message +
          '\n\n브라우저가 SharedArrayBuffer 를 지원해야 하며, 페이지에 COOP/COEP 헤더가 필요합니다.'
      );
    } finally {
      setExporting(null);
    }
  };

  const fontStack =
    FONTS.find((f) => f.id === selected.fontFamily)?.stack ?? FONTS[0].stack;

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold">인스타형 영상생성기</h1>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Beta
            </span>
            <span className="num text-xs text-muted-foreground">
              {list.length}장
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={addNew}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40"
            >
              + 슬라이드
            </button>
            <button
              onClick={duplicateSelected}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40"
            >
              복제
            </button>
            <button
              onClick={() => move(-1)}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40"
            >
              ↑
            </button>
            <button
              onClick={() => move(1)}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40"
            >
              ↓
            </button>
            <button
              onClick={removeSelected}
              disabled={list.length <= 1}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-destructive/40 disabled:opacity-40"
            >
              − 삭제
            </button>
            <div className="mx-1 h-4 w-px bg-border" />
            <button
              onClick={onExportSelectedPng}
              disabled={!!exporting}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40 disabled:opacity-60"
            >
              {exporting === 'png' ? '…' : '↓ 선택 PNG'}
            </button>
            <button
              onClick={onExportAllZip}
              disabled={!!exporting}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40 disabled:opacity-60"
            >
              {exporting === 'zip' ? '…' : '↓ 전체 ZIP'}
            </button>
            <label className="flex items-center gap-1 text-[11px]">
              <span className="text-muted-foreground">초/장</span>
              <select
                value={secondsPerSlide}
                onChange={(e) => setSecondsPerSlide(Number(e.target.value))}
                className="h-7 rounded-md border bg-background px-2"
              >
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="5">5</option>
                <option value="8">8</option>
              </select>
            </label>
            <button
              onClick={onExportMp4}
              disabled={!!exporting}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              title="ffmpeg.wasm 약 30MB 로딩됩니다 (첫 호출만)"
            >
              {exporting === 'mp4' ? '렌더링 중…' : '↓ MP4'}
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2 text-xs">
          <span className="font-semibold text-primary">✨ AI</span>
          <input
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAiGenerate();
            }}
            placeholder="주제를 입력하세요 (예: 챗GPT 활용 5가지 팁)"
            className="h-7 flex-1 min-w-[200px] rounded-md border bg-transparent px-2"
          />
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">장수</span>
            <select
              value={aiCount}
              onChange={(e) => setAiCount(Number(e.target.value))}
              className="h-7 rounded-md border bg-background px-2"
            >
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="7">7</option>
              <option value="10">10</option>
              <option value="12">12</option>
            </select>
          </label>
          <button
            onClick={onAiGenerate}
            disabled={aiBusy}
            className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 text-primary hover:bg-primary/20 disabled:opacity-60"
          >
            {aiBusy ? '⋯' : '슬라이드 생성'}
          </button>
          {aiError && <span className="text-destructive">⚠ {aiError}</span>}
        </div>

        <div className="flex-1 overflow-auto bg-secondary/30 p-8">
          <div className="flex flex-wrap justify-center gap-6">
            {list.map((s, i) => (
              <div key={s.id} className="flex flex-col items-center gap-1">
                <span className="text-[11px] text-muted-foreground">
                  #{i + 1}
                </span>
                <SlideCard
                  s={s}
                  isSelected={s.id === selectedId}
                  onClick={() => setSelectedId(s.id)}
                  attachRef={(el) => refsMap.current.set(s.id, el)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 overflow-auto border-l bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">편집</h2>
        </div>

        <div className="space-y-5 p-4">
          <Field label="제목">
            <input
              value={selected.title}
              onChange={(e) => update('title', e.target.value)}
              className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
            />
          </Field>

          <Field label="본문">
            <textarea
              value={selected.body}
              onChange={(e) => update('body', e.target.value)}
              rows={5}
              className="w-full rounded-md border bg-transparent p-2 text-sm"
            />
          </Field>

          <Field label="폰트">
            <div className="flex flex-wrap gap-1">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => update('fontFamily', f.id)}
                  style={{ fontFamily: f.stack }}
                  className={cn(
                    'h-7 rounded-md border px-3 text-xs',
                    selected.fontFamily === f.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-accent'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="배경">
            <div className="flex gap-1">
              {(['solid', 'gradient'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => update('bgKind', k)}
                  className={cn(
                    'h-7 flex-1 rounded-md border text-xs',
                    selected.bgKind === k
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-accent'
                  )}
                >
                  {k === 'solid' ? '단색' : '그라데이션'}
                </button>
              ))}
            </div>
          </Field>

          {selected.bgKind === 'solid' && (
            <Field label="배경색">
              <div className="flex flex-wrap gap-1">
                {SOLID_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => update('bgColor1', c)}
                    className={cn(
                      'h-6 w-6 rounded border-2 transition',
                      selected.bgColor1 === c
                        ? 'border-primary ring-2 ring-primary ring-offset-1'
                        : 'border-transparent hover:border-muted-foreground'
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={selected.bgColor1}
                  onChange={(e) => update('bgColor1', e.target.value)}
                  className="h-6 w-6 cursor-pointer rounded border-0"
                />
              </div>
            </Field>
          )}

          {selected.bgKind === 'gradient' && (
            <>
              <Field label="그라데이션 프리셋">
                <div className="flex flex-wrap gap-1">
                  {PRESET_GRADIENTS.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        update('bgColor1', g.c1);
                        update('bgColor2', g.c2);
                      }}
                      className="h-7 w-12 rounded border hover:border-foreground/40"
                      style={{
                        background: `linear-gradient(135deg, ${g.c1}, ${g.c2})`,
                      }}
                    />
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="시작색">
                  <input
                    type="color"
                    value={selected.bgColor1}
                    onChange={(e) => update('bgColor1', e.target.value)}
                    className="h-8 w-full cursor-pointer rounded border"
                  />
                </Field>
                <Field label="끝색">
                  <input
                    type="color"
                    value={selected.bgColor2}
                    onChange={(e) => update('bgColor2', e.target.value)}
                    className="h-8 w-full cursor-pointer rounded border"
                  />
                </Field>
              </div>
            </>
          )}

          <Field label="텍스트 색">
            <input
              type="color"
              value={selected.textColor}
              onChange={(e) => update('textColor', e.target.value)}
              className="h-8 w-full cursor-pointer rounded border"
            />
          </Field>

          <div className="grid grid-cols-3 gap-1">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                onClick={() => update('align', a)}
                className={cn(
                  'h-7 rounded-md border text-xs',
                  selected.align === a
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                )}
              >
                {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1">
            {(['top', 'middle', 'bottom'] as const).map((v) => (
              <button
                key={v}
                onClick={() => update('vertical', v)}
                className={cn(
                  'h-7 rounded-md border text-xs',
                  selected.vertical === v
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                )}
              >
                {v === 'top' ? '⤒' : v === 'middle' ? '⇕' : '⤓'}
              </button>
            ))}
          </div>

          <Slider
            label="너비"
            suffix="px"
            min={360}
            max={720}
            value={selected.width}
            onChange={(v) => update('width', v)}
          />
          <Slider
            label="제목 크기"
            suffix="px"
            min={20}
            max={80}
            value={selected.titleSize}
            onChange={(v) => update('titleSize', v)}
          />
          <Slider
            label="본문 크기"
            suffix="px"
            min={14}
            max={48}
            value={selected.fontSize}
            onChange={(v) => update('fontSize', v)}
          />
        </div>
      </aside>
    </div>
  );
}

function SlideCard({
  s,
  isSelected,
  onClick,
  attachRef,
}: {
  s: SlideData;
  isSelected: boolean;
  onClick: () => void;
  attachRef: (el: HTMLDivElement | null) => void;
}) {
  const fontStack =
    FONTS.find((f) => f.id === s.fontFamily)?.stack ?? FONTS[0].stack;

  const bg =
    s.bgKind === 'gradient'
      ? `linear-gradient(135deg, ${s.bgColor1} 0%, ${s.bgColor2} 100%)`
      : s.bgColor1;

  const justify =
    s.vertical === 'top'
      ? 'flex-start'
      : s.vertical === 'bottom'
        ? 'flex-end'
        : 'center';

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative cursor-pointer transition',
        isSelected
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-secondary/30'
          : 'hover:ring-1 hover:ring-muted-foreground/40'
      )}
      style={{ borderRadius: 12 }}
    >
      <div
        ref={attachRef}
        className="overflow-hidden p-8"
        style={{
          width: `${s.width}px`,
          height: `${(s.width * 16) / 9}px`,
          background: bg,
          color: s.textColor,
          fontFamily: fontStack,
          textAlign: s.align,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: justify,
          gap: '0.6em',
          borderRadius: 12,
        }}
      >
        {s.title && (
          <div
            style={{
              fontSize: `${s.titleSize}px`,
              fontWeight: 700,
              lineHeight: 1.2,
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
            }}
          >
            {s.title}
          </div>
        )}
        {s.body && (
          <div
            style={{
              fontSize: `${s.fontSize}px`,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'keep-all',
              opacity: 0.95,
            }}
          >
            {s.body}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function Slider({
  label,
  suffix = '',
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  suffix?: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="num text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
