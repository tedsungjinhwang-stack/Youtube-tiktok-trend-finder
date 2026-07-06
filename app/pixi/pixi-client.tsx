'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/* ─────────────── 스타일 타입 (1080×1920 기준 값) ─────────────── */

export type PixiStyle = {
  bgType: 'solid' | 'gradient';
  bg1: string;
  bg2: string;
  bgAngle: number; // deg
  showProfile: boolean;
  avatarUrl: string | null; // dataURL
  name: string;
  handle: string;
  title: string; // \n 줄바꿈
  caption: string;
  nameColor: string;
  handleColor: string;
  titleColor: string;
  captionColor: string;
  titleSize: number; // px @1080
  captionSize: number;
  font: string;
};

export type SavedTemplate = { id: string; name: string; style: PixiStyle };

const FONTS = [
  { v: 'Noto Sans KR', label: '노토 산스' },
  { v: 'Gowun Dodum', label: '고운돋움' },
  { v: 'Nanum Pen Script', label: '나눔손글씨' },
  { v: 'Oswald', label: 'Oswald' },
  { v: 'Roboto', label: 'Roboto' },
];

const DEFAULT_STYLE: PixiStyle = {
  bgType: 'gradient',
  bg1: '#2a1250',
  bg2: '#7c3aed',
  bgAngle: 160,
  showProfile: true,
  avatarUrl: null,
  name: '군림보',
  handle: '@custom_preset',
  title: '제목을\n입력하세요',
  caption: '자막을 입력하세요',
  nameColor: '#ffffff',
  handleColor: '#c4b5fd',
  titleColor: '#ffffff',
  captionColor: '#e9d5ff',
  titleSize: 104,
  captionSize: 44,
  font: 'Noto Sans KR',
};

/* ─────────────── 기본 프리셋 ─────────────── */

type Preset = { name: string; patch: Partial<PixiStyle> };
const PRESETS: Preset[] = [
  { name: '퍼플', patch: { bgType: 'gradient', bg1: '#2a1250', bg2: '#7c3aed', bgAngle: 160, titleColor: '#fff', nameColor: '#fff', handleColor: '#c4b5fd', captionColor: '#e9d5ff' } },
  { name: '다크', patch: { bgType: 'solid', bg1: '#141414', bg2: '#141414', titleColor: '#fff', nameColor: '#fff', handleColor: '#f59e0b', captionColor: '#d4d4d4' } },
  { name: '블루', patch: { bgType: 'gradient', bg1: '#1e3a8a', bg2: '#3b82f6', bgAngle: 160, titleColor: '#fff', nameColor: '#fff', handleColor: '#bfdbfe', captionColor: '#dbeafe' } },
  { name: '선셋', patch: { bgType: 'gradient', bg1: '#ec4899', bg2: '#8b5cf6', bgAngle: 160, titleColor: '#fff', nameColor: '#fff', handleColor: '#fce7f3', captionColor: '#fbcfe8' } },
  { name: '기본', patch: { bgType: 'solid', bg1: '#ffffff', bg2: '#ffffff', titleColor: '#111111', nameColor: '#111111', handleColor: '#2563eb', captionColor: '#444444' } },
  { name: '민트', patch: { bgType: 'gradient', bg1: '#a7f3d0', bg2: '#34d399', bgAngle: 160, titleColor: '#064e3b', nameColor: '#064e3b', handleColor: '#047857', captionColor: '#065f46' } },
];

const W = 1080;
const H = 1920;

export function PixiClient({
  initialTemplates,
  warning,
}: {
  initialTemplates: SavedTemplate[];
  warning: string | null;
}) {
  const router = useRouter();
  const [style, setStyle] = useState<PixiStyle>(DEFAULT_STYLE);
  const [templates, setTemplates] = useState<SavedTemplate[]>(initialTemplates);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const set = <K extends keyof PixiStyle>(k: K, v: PixiStyle[K]) =>
    setStyle((s) => ({ ...s, [k]: v }));

  // 폰트 로드 대기
  useEffect(() => {
    let alive = true;
    const anyDoc = document as unknown as { fonts?: { ready: Promise<unknown> } };
    if (anyDoc.fonts?.ready) {
      anyDoc.fonts.ready.then(() => alive && setFontsReady(true));
    } else {
      setFontsReady(true);
    }
    return () => {
      alive = false;
    };
  }, []);

  // 아바타 이미지 로드
  useEffect(() => {
    if (!style.avatarUrl) {
      avatarImgRef.current = null;
      draw();
      return;
    }
    const img = new Image();
    img.onload = () => {
      avatarImgRef.current = img;
      draw();
    };
    img.src = style.avatarUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style.avatarUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawScene(canvas, style, avatarImgRef.current);
  }, [style]);

  useEffect(() => {
    draw();
  }, [draw, fontsReady]);

  /* ── 액션 ── */

  function applyPreset(p: Preset) {
    setStyle((s) => ({ ...s, ...p.patch }));
  }

  function randomize() {
    const hues = [Math.floor(Math.random() * 360), Math.floor(Math.random() * 360)];
    const c1 = `hsl(${hues[0]}, 60%, 25%)`;
    const c2 = `hsl(${hues[1]}, 70%, 55%)`;
    setStyle((s) => ({
      ...s,
      bgType: 'gradient',
      bg1: hslToHex(c1),
      bg2: hslToHex(c2),
      bgAngle: [120, 160, 180, 200][Math.floor(Math.random() * 4)],
      titleColor: '#ffffff',
      nameColor: '#ffffff',
      handleColor: '#ffffffcc',
      captionColor: '#ffffffdd',
    }));
  }

  function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => set('avatarUrl', String(reader.result));
    reader.readAsDataURL(f);
  }

  function exportPng() {
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    drawScene(off, style, avatarImgRef.current, true);
    off.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pixi_${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }

  async function saveTemplate() {
    if (saving) return;
    const name = prompt('템플릿 이름', style.name || '내 템플릿');
    if (name === null) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/pixi-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || '내 템플릿', style }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) {
        alert(`저장 실패: ${j.error?.message ?? res.status}`);
        return;
      }
      setTemplates((t) => [...t, { id: j.data.id, name: j.data.name, style }]);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('이 템플릿을 삭제할까요?')) return;
    await fetch(`/api/v1/pixi-templates/${id}`, { method: 'DELETE' });
    setTemplates((t) => t.filter((x) => x.id !== id));
    router.refresh();
  }

  /* ── 렌더 ── */

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">픽시에디터</h1>
        <span className="text-sm text-muted-foreground">인스타 템플릿 · 이미지로 저장</span>
        <div className="flex-1" />
        <button
          onClick={exportPng}
          className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          ⬇️ 이미지 내보내기 (PNG)
        </button>
      </div>

      {warning && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {warning}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* 미리보기 */}
        <div className="flex shrink-0 justify-center">
          <div className="relative">
            <span className="absolute right-2 top-2 z-10 rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              9:16
            </span>
            <canvas
              ref={canvasRef}
              width={360}
              height={640}
              className="rounded-xl border shadow-lg"
              style={{ width: 300, height: 533 }}
            />
          </div>
        </div>

        {/* 컨트롤 */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* 프리셋 */}
          <Section title="기본 템플릿">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className="h-16 w-16 overflow-hidden rounded-lg border text-[11px] font-semibold shadow-sm"
                  style={presetSwatch(p)}
                  title={p.name}
                >
                  <span className="grid h-full w-full place-items-center bg-black/10 text-white drop-shadow">
                    {p.name}
                  </span>
                </button>
              ))}
              <button
                onClick={randomize}
                className="h-16 w-16 rounded-lg border text-[12px] font-semibold hover:bg-accent"
              >
                ✨ 랜덤
              </button>
            </div>
          </Section>

          {/* 텍스트 */}
          <Section title="텍스트">
            <div className="grid grid-cols-2 gap-2">
              <Field label="이름">
                <input value={style.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
              </Field>
              <Field label="아이디(@핸들)">
                <input value={style.handle} onChange={(e) => set('handle', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="제목 (엔터로 줄바꿈)">
              <textarea
                value={style.title}
                onChange={(e) => set('title', e.target.value)}
                rows={2}
                className={inputCls + ' resize-none'}
              />
            </Field>
            <Field label="자막">
              <input value={style.caption} onChange={(e) => set('caption', e.target.value)} className={inputCls} />
            </Field>
          </Section>

          {/* 프로필 */}
          <Section title="프로필">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={style.showProfile}
                  onChange={(e) => set('showProfile', e.target.checked)}
                  className="h-4 w-4"
                />
                프로필 표시
              </label>
              <label className="cursor-pointer rounded-md border bg-card px-3 py-1.5 text-[13px] font-medium hover:border-foreground/40">
                프로필 사진 업로드
                <input type="file" accept="image/*" className="hidden" onChange={onAvatarPick} />
              </label>
              {style.avatarUrl && (
                <button
                  onClick={() => set('avatarUrl', null)}
                  className="text-[12px] text-rose-400 hover:underline"
                >
                  사진 제거
                </button>
              )}
            </div>
          </Section>

          {/* 배경 */}
          <Section title="배경">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={style.bgType}
                onChange={(e) => set('bgType', e.target.value as PixiStyle['bgType'])}
                className={inputCls + ' w-auto'}
              >
                <option value="gradient">그라데이션</option>
                <option value="solid">단색</option>
              </select>
              <ColorInput label="색1" value={style.bg1} onChange={(v) => set('bg1', v)} />
              {style.bgType === 'gradient' && (
                <>
                  <ColorInput label="색2" value={style.bg2} onChange={(v) => set('bg2', v)} />
                  <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    각도
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={style.bgAngle}
                      onChange={(e) => set('bgAngle', Number(e.target.value))}
                    />
                  </label>
                </>
              )}
            </div>
          </Section>

          {/* 폰트/색/크기 */}
          <Section title="폰트 · 색상 · 크기">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
                폰트
                <select value={style.font} onChange={(e) => set('font', e.target.value)} className={inputCls + ' w-auto'}>
                  {FONTS.map((f) => (
                    <option key={f.v} value={f.v}>{f.label}</option>
                  ))}
                </select>
              </label>
              <ColorInput label="제목색" value={style.titleColor} onChange={(v) => set('titleColor', v)} />
              <ColorInput label="이름색" value={style.nameColor} onChange={(v) => set('nameColor', v)} />
              <ColorInput label="@색" value={style.handleColor} onChange={(v) => set('handleColor', v)} />
              <ColorInput label="자막색" value={style.captionColor} onChange={(v) => set('captionColor', v)} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                제목 크기 {style.titleSize}
                <input type="range" min={48} max={160} value={style.titleSize} onChange={(e) => set('titleSize', Number(e.target.value))} />
              </label>
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                자막 크기 {style.captionSize}
                <input type="range" min={28} max={80} value={style.captionSize} onChange={(e) => set('captionSize', Number(e.target.value))} />
              </label>
            </div>
          </Section>

          {/* 내 템플릿 */}
          <Section title="내 템플릿">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={saveTemplate}
                disabled={saving}
                className="grid h-20 w-16 place-items-center rounded-lg border border-dashed text-[11px] text-muted-foreground hover:border-foreground/40 disabled:opacity-50"
              >
                {saving ? '저장중' : '+ 현재\n스타일 저장'.split('\n').map((l, i) => <span key={i} className="block">{l}</span>)}
              </button>
              {templates.map((t) => (
                <div key={t.id} className="relative">
                  <button
                    onClick={() => setStyle((s) => ({ ...s, ...t.style }))}
                    className="h-20 w-16 overflow-hidden rounded-lg border text-[10px] font-semibold text-white shadow-sm"
                    style={presetSwatch({ name: t.name, patch: t.style })}
                    title={t.name}
                  >
                    <span className="grid h-full w-full place-items-center bg-black/15 px-1 text-center drop-shadow">
                      {t.name}
                    </span>
                  </button>
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-[11px] text-white"
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 캔버스 렌더 ─────────────── */

function drawScene(
  canvas: HTMLCanvasElement,
  s: PixiStyle,
  avatar: HTMLImageElement | null,
  full = false
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.scale(canvas.width / W, canvas.height / H);
  ctx.clearRect(0, 0, W, H);

  // 배경
  if (s.bgType === 'gradient') {
    const rad = (s.bgAngle * Math.PI) / 180;
    const cx = W / 2, cy = H / 2;
    const len = Math.max(W, H);
    const dx = Math.cos(rad) * len, dy = Math.sin(rad) * len;
    const g = ctx.createLinearGradient(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2);
    g.addColorStop(0, s.bg1);
    g.addColorStop(1, s.bg2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = s.bg1;
  }
  ctx.fillRect(0, 0, W, H);

  const P = 84;
  ctx.textBaseline = 'alphabetic';

  // 프로필
  let topY = 120;
  if (s.showProfile) {
    const AV = 108;
    const ax = P, ay = topY;
    // 아바타 원
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2);
    ctx.closePath();
    if (avatar) {
      ctx.clip();
      // cover
      const ar = avatar.width / avatar.height;
      let dw = AV, dh = AV, dxi = ax, dyi = ay;
      if (ar > 1) { dw = AV * ar; dxi = ax - (dw - AV) / 2; }
      else { dh = AV / ar; dyi = ay - (dh - AV) / 2; }
      ctx.drawImage(avatar, dxi, dyi, dw, dh);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fill();
      ctx.fillStyle = s.nameColor;
      ctx.font = `700 54px ${s.font}, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText((s.name || '?').slice(0, 1), ax + AV / 2, ay + AV / 2 + 20);
    }
    ctx.restore();
    // 원 테두리
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ax + AV / 2, ay + AV / 2, AV / 2, 0, Math.PI * 2);
    ctx.stroke();

    const tx = ax + AV + 28;
    ctx.textAlign = 'left';
    ctx.fillStyle = s.nameColor;
    ctx.font = `700 42px ${s.font}, sans-serif`;
    ctx.fillText(s.name, tx, ay + 46);
    ctx.fillStyle = s.handleColor;
    ctx.font = `500 34px ${s.font}, sans-serif`;
    ctx.fillText(s.handle, tx, ay + 94);
    topY = ay + AV + 80;
  } else {
    topY = 150;
  }

  // 제목
  ctx.textAlign = 'left';
  ctx.fillStyle = s.titleColor;
  ctx.font = `800 ${s.titleSize}px ${s.font}, sans-serif`;
  const maxW = W - P * 2;
  const titleLines = wrapLines(ctx, s.title, maxW);
  const lh = s.titleSize * 1.18;
  let ty = topY + 190 + s.titleSize;
  for (const line of titleLines) {
    ctx.fillText(line, P, ty);
    ty += lh;
  }

  // 자막 (하단쪽)
  ctx.fillStyle = s.captionColor;
  ctx.font = `600 ${s.captionSize}px ${s.font}, sans-serif`;
  const capLines = wrapLines(ctx, s.caption, maxW);
  let cy2 = H - 620;
  for (const line of capLines) {
    ctx.fillText(line, P, cy2);
    cy2 += s.captionSize * 1.35;
  }

  ctx.restore();
  void full;
}

// \n 유지 + 폭 초과 시 글자 단위 줄바꿈 (공백 우선)
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of (text || '').split('\n')) {
    if (para === '') { out.push(''); continue; }
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line !== '') {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/* ─────────────── UI 헬퍼 ─────────────── */

const inputCls =
  'h-9 w-full rounded-md border bg-background px-2 text-[14px] outline-none focus:border-foreground/40';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[13px] font-semibold text-muted-foreground">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 text-[12px] text-muted-foreground">
      {label}
      <input
        type="color"
        value={toHex6(value)}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-8 cursor-pointer rounded border bg-transparent p-0"
      />
    </label>
  );
}

function presetSwatch(p: { name: string; patch: Partial<PixiStyle> }): React.CSSProperties {
  const st = p.patch;
  if (st.bgType === 'solid') return { background: st.bg1 ?? '#333' };
  return { background: `linear-gradient(160deg, ${st.bg1 ?? '#333'}, ${st.bg2 ?? '#666'})` };
}

function toHex6(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    return '#' + c.slice(1).split('').map((x) => x + x).join('');
  }
  if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7);
  return '#ffffff';
}

function hslToHex(hsl: string): string {
  const m = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!m) return '#7c3aed';
  const h = Number(m[1]) / 360, sN = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const a = sN * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
