'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Theme = 'dark' | 'light';

type CommentData = {
  authorName: string;
  content: string;
  timeAgo: string;
  likes: string;
  avatarBg: string;
  avatarLetter: string;
  showTime: boolean;
  showLikes: boolean;
  showReplyAction: boolean;
  isVerified: boolean;
  replyText: string;
  /** 카드 너비 px */
  width: number;
  /** 본문 폰트 크기 */
  bodyFontSize: number;
  /** 사용자명 폰트 크기 */
  nameFontSize: number;
  /** 프로필 크기 */
  avatarSize: number;
  /** 카드 투명도 0~100 */
  opacity: number;
  /** 카드 모서리 radius */
  borderRadius: number;
  theme: Theme;
};

const DEFAULT_COMMENT: CommentData = {
  authorName: '테크요정',
  content:
    '와.. 진짜 유용한 기능이네요! 투명 배경으로 저장되니까 영상 편집할 때 바로 쓸 수 있어서 너무 좋아요. 다음 업데이트도 기대됩니다! 🔥',
  timeAgo: '2시간 전',
  likes: '1.2천',
  avatarBg: '#FF5722',
  avatarLetter: '테',
  showTime: true,
  showLikes: true,
  showReplyAction: true,
  isVerified: false,
  replyText: '답글',
  width: 600,
  bodyFontSize: 16,
  nameFontSize: 13,
  avatarSize: 40,
  opacity: 100,
  borderRadius: 16,
  theme: 'dark',
};

const COLORS = [
  '#FF5722', '#E91E63', '#9C27B0', '#673AB7',
  '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
  '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
  '#FFC107', '#FF9800', '#795548', '#607D8B',
];

const EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '👏', '✨', '✅', '🙏', '💯'];

export default function CommentGeneratorPage() {
  const [c, setC] = useState<CommentData>(DEFAULT_COMMENT);
  const previewRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const update = <K extends keyof CommentData>(k: K, v: CommentData[K]) =>
    setC((prev) => ({ ...prev, [k]: v }));

  const onAuthorChange = (name: string) => {
    setC((p) => ({
      ...p,
      authorName: name,
      avatarLetter: name.trim().slice(0, 1) || '?',
    }));
  };

  const onExportPng = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, {
        backgroundColor: null,
        scale: 2,
      });
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob(res, 'image/png')
      );
      if (!blob) throw new Error('blob 생성 실패');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comment-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('내보내기 실패: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const isDark = c.theme === 'dark';
  const cardBg = isDark ? 'rgba(30, 30, 30, 1)' : 'rgba(255, 255, 255, 1)';
  const textColor = isDark ? '#ffffff' : '#0f172a';

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex-1 overflow-auto bg-secondary/30 p-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">댓글 생성기</h1>
          <button
            onClick={onExportPng}
            disabled={exporting}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {exporting ? '내보내는 중…' : '↓ PNG 내보내기'}
          </button>
        </div>

        <div className="flex justify-center">
          <div
            ref={previewRef}
            className="flex items-start gap-4 p-5 md:p-6"
            style={{
              width: `${c.width}px`,
              borderRadius: `${c.borderRadius}px`,
              backgroundColor: cardBg,
              color: textColor,
              opacity: c.opacity / 100,
              fontFamily:
                'Noto Sans KR, "Noto Sans JP", "Noto Sans SC", sans-serif',
            }}
          >
            <div
              className="flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white"
              style={{
                width: `${c.avatarSize}px`,
                height: `${c.avatarSize}px`,
                fontSize: `${c.avatarSize / 2}px`,
                backgroundColor: c.avatarBg,
              }}
            >
              {c.avatarLetter}
            </div>

            <div className="min-w-0 flex-1">
              <div
                className="mb-1.5 flex flex-wrap items-center gap-2 leading-none"
                style={{ fontSize: `${c.nameFontSize}px` }}
              >
                <span className="whitespace-nowrap font-semibold">
                  {c.authorName}
                </span>
                {c.isVerified && (
                  <span
                    title="인증됨"
                    className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px]"
                    style={{ backgroundColor: '#aaa', color: '#fff' }}
                  >
                    ✓
                  </span>
                )}
                {c.showTime && (
                  <span className="text-[0.9em] opacity-60">{c.timeAgo}</span>
                )}
              </div>

              <div
                className="mb-2.5 break-words text-left opacity-95"
                style={{
                  fontSize: `${c.bodyFontSize}px`,
                  fontWeight: 400,
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                }}
              >
                {c.content}
              </div>

              <div className="flex items-center gap-4 text-xs font-medium opacity-70">
                {c.showLikes && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <ThumbUp size={16} />
                      <span>{c.likes}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ThumbUp size={16} flip />
                    </div>
                  </>
                )}
                {c.showReplyAction && c.replyText && (
                  <span className="cursor-pointer hover:opacity-100">
                    {c.replyText}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 overflow-auto border-l bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">편집</h2>
        </div>

        <div className="space-y-5 p-4">
          <Field label="작성자">
            <div className="flex gap-1.5">
              <input
                value={c.authorName}
                onChange={(e) => onAuthorChange(e.target.value)}
                className="h-8 flex-1 rounded-md border bg-transparent px-2 text-sm"
              />
            </div>
          </Field>

          <Field label="이니셜 (1글자)">
            <input
              value={c.avatarLetter}
              onChange={(e) =>
                update('avatarLetter', e.target.value.slice(0, 1))
              }
              maxLength={1}
              className="h-8 w-16 rounded-md border bg-transparent px-2 text-sm"
            />
          </Field>

          <Field label="프로필 배경색">
            <div className="flex flex-wrap gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => update('avatarBg', color)}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition',
                    c.avatarBg === color
                      ? 'border-primary ring-2 ring-primary ring-offset-1'
                      : 'border-transparent hover:border-muted-foreground'
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              <input
                type="color"
                value={c.avatarBg}
                onChange={(e) => update('avatarBg', e.target.value)}
                className="h-6 w-6 cursor-pointer rounded-full border-0"
                title="커스텀 색상"
              />
            </div>
          </Field>

          <Field label="내용">
            <textarea
              value={c.content}
              onChange={(e) => update('content', e.target.value)}
              rows={4}
              className="w-full rounded-md border bg-transparent p-2 text-sm"
            />
          </Field>

          <Field label="이모지 빠른 삽입">
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => update('content', c.content + emoji)}
                  className="rounded p-1 text-base hover:bg-muted"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="시간">
              <input
                value={c.timeAgo}
                onChange={(e) => update('timeAgo', e.target.value)}
                className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
              />
            </Field>
            <Field label="좋아요">
              <input
                value={c.likes}
                onChange={(e) => update('likes', e.target.value)}
                className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
              />
            </Field>
          </div>

          <Field label="답글 텍스트 (비우면 숨김)">
            <input
              value={c.replyText}
              onChange={(e) => update('replyText', e.target.value)}
              placeholder="답글, Reply, 返信..."
              className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
            <Toggle
              checked={c.showTime}
              onChange={(v) => update('showTime', v)}
              label="시간 표시"
            />
            <Toggle
              checked={c.showLikes}
              onChange={(v) => update('showLikes', v)}
              label="좋아요 표시"
            />
            <Toggle
              checked={c.showReplyAction}
              onChange={(v) => update('showReplyAction', v)}
              label="답글 표시"
            />
            <Toggle
              checked={c.isVerified}
              onChange={(v) => update('isVerified', v)}
              label="인증됨"
            />
          </div>

          <div className="border-t pt-3">
            <h3 className="mb-3 text-sm font-semibold">스타일</h3>

            <Field label="테마">
              <div className="flex gap-1">
                {(['dark', 'light'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => update('theme', t)}
                    className={cn(
                      'h-7 flex-1 rounded-md border text-xs',
                      c.theme === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-accent'
                    )}
                  >
                    {t === 'dark' ? '다크' : '라이트'}
                  </button>
                ))}
              </div>
            </Field>

            <Slider
              label="너비"
              suffix="px"
              min={300}
              max={800}
              value={c.width}
              onChange={(v) => update('width', v)}
            />
            <Slider
              label="본문"
              suffix="px"
              min={12}
              max={24}
              value={c.bodyFontSize}
              onChange={(v) => update('bodyFontSize', v)}
            />
            <Slider
              label="사용자명"
              suffix="px"
              min={10}
              max={20}
              value={c.nameFontSize}
              onChange={(v) => update('nameFontSize', v)}
            />
            <Slider
              label="프로필"
              suffix="px"
              min={24}
              max={64}
              value={c.avatarSize}
              onChange={(v) => update('avatarSize', v)}
            />
            <Slider
              label="투명도"
              suffix="%"
              min={0}
              max={100}
              value={c.opacity}
              onChange={(v) => update('opacity', v)}
            />
            <Slider
              label="모서리"
              suffix="px"
              min={0}
              max={32}
              value={c.borderRadius}
              onChange={(v) => update('borderRadius', v)}
            />
          </div>
        </div>
      </aside>
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

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition',
          checked ? 'bg-primary' : 'bg-input'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </button>
      <span className="font-medium">{label}</span>
    </label>
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

function ThumbUp({ size, flip = false }: { size: number; flip?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={flip ? { transform: 'rotate(180deg)' } : undefined}
      aria-hidden
    >
      <path d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  );
}
