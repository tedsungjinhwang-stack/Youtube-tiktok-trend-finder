'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Theme = 'dark' | 'light';

type TemplateId = 'default' | 'mlt' | 'news' | 'cyber' | 'insta' | 'overlay';

type FontId = 'noto-kr' | 'noto-jp' | 'roboto' | 'gowun' | 'nanum-pen' | 'oswald';

type CommentData = {
  id: string;
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
  width: number;
  bodyFontSize: number;
  nameFontSize: number;
  avatarSize: number;
  opacity: number;
  borderRadius: number;
  theme: Theme;
  template: TemplateId;
  fontFamily: FontId;
};

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeDefault(): CommentData {
  return {
    id: makeId(),
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
    template: 'default',
    fontFamily: 'noto-kr',
  };
}

const COLORS = [
  '#FF5722', '#E91E63', '#9C27B0', '#673AB7',
  '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
  '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
  '#FFC107', '#FF9800', '#795548', '#607D8B',
];

const EMOJIS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '👏', '✨', '✅', '🙏', '💯'];

const TEMPLATES: { id: TemplateId; label: string }[] = [
  { id: 'default', label: '기본' },
  { id: 'mlt', label: '마리텔' },
  { id: 'news', label: '뉴스' },
  { id: 'cyber', label: '사이버' },
  { id: 'insta', label: '인스타' },
  { id: 'overlay', label: '오버레이' },
];

const FONTS: { id: FontId; label: string; stack: string }[] = [
  { id: 'noto-kr', label: '노토 산스 KR', stack: '"Noto Sans KR", "Noto Sans JP", "Noto Sans SC", sans-serif' },
  { id: 'noto-jp', label: '노토 산스 JP', stack: '"Noto Sans JP", "Noto Sans KR", sans-serif' },
  { id: 'roboto', label: 'Roboto', stack: 'Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'gowun', label: '고운 돋움', stack: '"Gowun Dodum", "Noto Sans KR", sans-serif' },
  { id: 'nanum-pen', label: '나눔 펜', stack: '"Nanum Pen Script", cursive' },
  { id: 'oswald', label: 'Oswald', stack: 'Oswald, "Bebas Neue", "Noto Sans KR", sans-serif' },
];

function getTemplateStyle(
  template: TemplateId,
  theme: Theme,
  borderRadius: number
): React.CSSProperties {
  switch (template) {
    case 'mlt':
      return {
        background: 'linear-gradient(135deg, #ff4d6d 0%, #ff8a3c 100%)',
        color: '#ffffff',
        borderRadius: `${borderRadius}px`,
        boxShadow: '0 8px 24px rgba(255,77,109,0.35)',
      };
    case 'news':
      return {
        background: '#ffffff',
        color: '#0a0a0a',
        borderRadius: `${Math.min(borderRadius, 4)}px`,
        borderLeft: '6px solid #d40000',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        fontFamily: 'Georgia, "Noto Serif KR", serif',
      };
    case 'cyber':
      return {
        background: 'rgba(10,10,20,0.95)',
        color: '#f0f6ff',
        borderRadius: `${borderRadius}px`,
        border: '1px solid #00e5ff',
        boxShadow: '0 0 12px #ff00aa, 0 0 28px rgba(0,229,255,0.45) inset',
      };
    case 'insta':
      return {
        background: theme === 'dark' ? '#0a0a0a' : '#ffffff',
        color: theme === 'dark' ? '#ffffff' : '#0a0a0a',
        borderRadius: `${borderRadius}px`,
        backgroundClip: 'padding-box',
        border: '3px solid transparent',
        backgroundImage:
          theme === 'dark'
            ? 'linear-gradient(#0a0a0a,#0a0a0a), linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)'
            : 'linear-gradient(#fff,#fff), linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)',
        backgroundOrigin: 'border-box',
        boxShadow: 'none',
      };
    case 'overlay':
      return {
        background: 'transparent',
        color: '#ffffff',
        borderRadius: '0px',
        textShadow: '0 2px 8px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.6)',
        boxShadow: 'none',
      };
    case 'default':
    default:
      return {
        background: theme === 'dark' ? 'rgba(30,30,30,1)' : '#ffffff',
        color: theme === 'dark' ? '#ffffff' : '#0f172a',
        borderRadius: `${borderRadius}px`,
      };
  }
}

function formatRelativeKorean(iso: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return '방금';
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(ms / 3_600_000);
  const day = Math.floor(ms / 86_400_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  if (day < 30) return `${day}일 전`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}개월 전`;
  return `${Math.floor(mo / 12)}년 전`;
}

function formatLikesKr(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

const AVATAR_COLOR_POOL = [
  '#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
  '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
  '#8BC34A', '#FFC107', '#FF9800', '#795548', '#607D8B',
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLOR_POOL[h % AVATAR_COLOR_POOL.length];
}

export default function CommentGeneratorPage() {
  const [list, setList] = useState<CommentData[]>(() => [makeDefault()]);
  const [selectedId, setSelectedId] = useState(() => list[0].id);
  const refsMap = useRef(new Map<string, HTMLDivElement | null>());
  const [exporting, setExporting] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytCount, setYtCount] = useState(10);
  const [ytOrder, setYtOrder] = useState<'relevance' | 'time'>('relevance');

  const selected = list.find((x) => x.id === selectedId) ?? list[0];

  useEffect(() => {
    if (!list.find((x) => x.id === selectedId) && list[0]) {
      setSelectedId(list[0].id);
    }
  }, [list, selectedId]);

  const update = <K extends keyof CommentData>(k: K, v: CommentData[K]) => {
    setList((prev) =>
      prev.map((x) => (x.id === selectedId ? { ...x, [k]: v } : x))
    );
  };

  const onAuthorChange = (name: string) => {
    setList((prev) =>
      prev.map((x) =>
        x.id === selectedId
          ? { ...x, authorName: name, avatarLetter: name.trim().slice(0, 1) || '?' }
          : x
      )
    );
  };

  const addNew = () => {
    const fresh = makeDefault();
    setList((prev) => [...prev, fresh]);
    setSelectedId(fresh.id);
  };

  const removeSelected = () => {
    if (list.length <= 1) return;
    setList((prev) => prev.filter((x) => x.id !== selectedId));
  };

  const duplicateSelected = () => {
    const dup = { ...selected, id: makeId() };
    setList((prev) => [...prev, dup]);
    setSelectedId(dup.id);
  };

  const exportNode = async (
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
    setExporting(true);
    try {
      const h2c = (await import('html2canvas')).default;
      const blob = await exportNode(node, h2c);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comment-${selected.id}.png`;
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

  const onFetchYoutube = async () => {
    setYtError(null);
    if (!ytUrl.trim()) {
      setYtError('YouTube URL 또는 videoId 를 입력하세요');
      return;
    }
    setYtLoading(true);
    try {
      const params = new URLSearchParams({
        url: ytUrl.trim(),
        maxResults: String(ytCount),
        order: ytOrder,
      });
      const r = await fetch(`/api/v1/youtube/comments?${params}`);
      const j = await r.json();
      if (!j.success) {
        setYtError(j.error?.message ?? '추출 실패');
        return;
      }
      const fetched = (j.data as Array<{
        authorName: string;
        textOriginal: string;
        likeCount: number;
        publishedAt: string;
      }>) ?? [];
      if (fetched.length === 0) {
        setYtError('댓글이 없습니다');
        return;
      }
      const items: CommentData[] = fetched.map((row) => {
        const name = (row.authorName ?? '').replace(/^@/, '').trim() || '익명';
        return {
          ...makeDefault(),
          id: makeId(),
          authorName: name,
          avatarLetter: name.slice(0, 1) || '?',
          avatarBg: hashColor(name),
          content: row.textOriginal ?? '',
          timeAgo: formatRelativeKorean(row.publishedAt),
          likes: formatLikesKr(row.likeCount ?? 0),
        };
      });
      setList(items);
      setSelectedId(items[0].id);
    } catch (e) {
      setYtError((e as Error).message);
    } finally {
      setYtLoading(false);
    }
  };

  const onExportAllZip = async () => {
    setExporting(true);
    try {
      const [{ default: h2c }, { default: JSZip }] = await Promise.all([
        import('html2canvas'),
        import('jszip'),
      ]);
      const zip = new JSZip();
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const node = refsMap.current.get(item.id);
        if (!node) continue;
        const blob = await exportNode(node, h2c);
        zip.file(`comment-${String(i + 1).padStart(2, '0')}-${item.id}.png`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comments-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('ZIP 내보내기 실패: ' + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">댓글 생성기</h1>
            <span className="num text-xs text-muted-foreground">
              {list.length}개
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={addNew}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40"
            >
              + 댓글 추가
            </button>
            <button
              onClick={duplicateSelected}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40"
            >
              복제
            </button>
            <button
              onClick={removeSelected}
              disabled={list.length <= 1}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-destructive/40 disabled:opacity-40"
            >
              − 삭제
            </button>
            <div className="mx-2 h-4 w-px bg-border" />
            <button
              onClick={onExportSelectedPng}
              disabled={exporting}
              className="rounded-md border bg-card px-3 py-1.5 text-xs hover:border-foreground/40 disabled:opacity-60"
            >
              ↓ 선택 PNG
            </button>
            <button
              onClick={onExportAllZip}
              disabled={exporting}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {exporting ? '내보내는 중…' : '↓ 전체 ZIP'}
            </button>
          </div>
        </header>

        <div className="space-y-2 border-b bg-background px-4 py-3">
          <div className="flex gap-2">
            <input
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onFetchYoutube();
              }}
              placeholder="YouTube URL 또는 11자리 videoId..."
              className="h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
            />
            <button
              onClick={onFetchYoutube}
              disabled={ytLoading}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {ytLoading ? '추출 중…' : '추출하기'}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">정렬:</span>
              <select
                value={ytOrder}
                onChange={(e) =>
                  setYtOrder(e.target.value as 'relevance' | 'time')
                }
                className="h-7 rounded-md border bg-background px-2"
              >
                <option value="relevance">관련도순</option>
                <option value="time">최신순</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">개수:</span>
              <select
                value={ytCount}
                onChange={(e) => setYtCount(Number(e.target.value))}
                className="h-7 rounded-md border bg-background px-2"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
            {ytError && (
              <span className="text-destructive">⚠ {ytError}</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-secondary/30 p-8">
          <div className="flex flex-col items-center gap-6">
            {list.map((c) => (
              <CommentCard
                key={c.id}
                c={c}
                isSelected={c.id === selectedId}
                onClick={() => setSelectedId(c.id)}
                attachRef={(el) => refsMap.current.set(c.id, el)}
              />
            ))}
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 overflow-auto border-l bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">편집</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            선택된 댓글: {selected.authorName}
          </p>
        </div>

        <div className="space-y-5 p-4">
          <Field label="작성자">
            <input
              value={selected.authorName}
              onChange={(e) => onAuthorChange(e.target.value)}
              className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
            />
          </Field>

          <Field label="이니셜 (1글자)">
            <input
              value={selected.avatarLetter}
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
                    selected.avatarBg === color
                      ? 'border-primary ring-2 ring-primary ring-offset-1'
                      : 'border-transparent hover:border-muted-foreground'
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              <input
                type="color"
                value={selected.avatarBg}
                onChange={(e) => update('avatarBg', e.target.value)}
                className="h-6 w-6 cursor-pointer rounded-full border-0"
                title="커스텀 색상"
              />
            </div>
          </Field>

          <Field label="내용">
            <textarea
              value={selected.content}
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
                  onClick={() => update('content', selected.content + emoji)}
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
                value={selected.timeAgo}
                onChange={(e) => update('timeAgo', e.target.value)}
                className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
              />
            </Field>
            <Field label="좋아요">
              <input
                value={selected.likes}
                onChange={(e) => update('likes', e.target.value)}
                className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
              />
            </Field>
          </div>

          <Field label="답글 텍스트 (비우면 숨김)">
            <input
              value={selected.replyText}
              onChange={(e) => update('replyText', e.target.value)}
              placeholder="답글, Reply, 返信..."
              className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
            <Toggle
              checked={selected.showTime}
              onChange={(v) => update('showTime', v)}
              label="시간 표시"
            />
            <Toggle
              checked={selected.showLikes}
              onChange={(v) => update('showLikes', v)}
              label="좋아요 표시"
            />
            <Toggle
              checked={selected.showReplyAction}
              onChange={(v) => update('showReplyAction', v)}
              label="답글 표시"
            />
            <Toggle
              checked={selected.isVerified}
              onChange={(v) => update('isVerified', v)}
              label="인증됨"
            />
          </div>

          <div className="border-t pt-3">
            <h3 className="mb-3 text-sm font-semibold">스타일</h3>

            <Field label="템플릿">
              <div className="flex flex-wrap gap-1">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => update('template', t.id)}
                    className={cn(
                      'h-7 rounded-md border px-3 text-xs',
                      selected.template === t.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-accent'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
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

            <Field label="테마">
              <div className="flex gap-1">
                {(['dark', 'light'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => update('theme', t)}
                    className={cn(
                      'h-7 flex-1 rounded-md border text-xs',
                      selected.theme === t
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
              value={selected.width}
              onChange={(v) => update('width', v)}
            />
            <Slider
              label="본문"
              suffix="px"
              min={12}
              max={24}
              value={selected.bodyFontSize}
              onChange={(v) => update('bodyFontSize', v)}
            />
            <Slider
              label="사용자명"
              suffix="px"
              min={10}
              max={20}
              value={selected.nameFontSize}
              onChange={(v) => update('nameFontSize', v)}
            />
            <Slider
              label="프로필"
              suffix="px"
              min={24}
              max={64}
              value={selected.avatarSize}
              onChange={(v) => update('avatarSize', v)}
            />
            <Slider
              label="투명도"
              suffix="%"
              min={0}
              max={100}
              value={selected.opacity}
              onChange={(v) => update('opacity', v)}
            />
            <Slider
              label="모서리"
              suffix="px"
              min={0}
              max={32}
              value={selected.borderRadius}
              onChange={(v) => update('borderRadius', v)}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function CommentCard({
  c,
  isSelected,
  onClick,
  attachRef,
}: {
  c: CommentData;
  isSelected: boolean;
  onClick: () => void;
  attachRef: (el: HTMLDivElement | null) => void;
}) {
  const tplStyle = getTemplateStyle(c.template, c.theme, c.borderRadius);
  const fontStack =
    FONTS.find((f) => f.id === c.fontFamily)?.stack ?? FONTS[0].stack;

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative cursor-pointer transition',
        isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-secondary/30' : 'hover:ring-1 hover:ring-muted-foreground/40'
      )}
      style={{ borderRadius: tplStyle.borderRadius }}
    >
      <div
        ref={attachRef}
        className="flex items-start gap-4 p-5 md:p-6"
        style={{
          width: `${c.width}px`,
          opacity: c.opacity / 100,
          fontFamily: fontStack,
          ...tplStyle,
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
