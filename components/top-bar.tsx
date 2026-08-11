'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/** 테마 저장 키. layout.tsx 의 선(先)적용 스크립트와 같은 값을 써야 한다. */
export const THEME_KEY = 'saeroi-toss-theme';

const tabs = [
  { href: '/', label: '전체 현황', match: ['/'] },
  { href: '/channel-dashboard', label: '유튜브', match: ['/channel-dashboard', '/my-schedule'] },
  { href: '/shopping-dashboard', label: '쇼핑쇼츠' },
  { href: '/threads-dashboard', label: '스레드' },
  { href: '/pixi', label: '픽시에디터' },
  { href: '/popular-feed', label: '해시태그검색' },
  { href: '/trending', label: '실시간 인기' },
  { href: '/all?platforms=YOUTUBE', label: '영상 조회', match: ['/all'] },
  { href: '/channels', label: '에셋 채널' },
  { href: '/stock', label: '소재창고' },
  { href: '/folders', label: '폴더' },
  { href: '/comment-generator', label: '댓글생성기' },
];

export function TopBar() {
  const pathname = usePathname();
  const [light, setLight] = useState(false);

  // 실제 적용은 head 스크립트가 이미 해뒀다. 여기서는 버튼 라벨을 맞추기 위해 읽기만.
  useEffect(() => {
    setLight(document.documentElement.classList.contains('light'));
  }, []);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains('light');
    document.documentElement.classList.toggle('light', next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'light' : 'dark');
    } catch {
      /* 프라이빗 모드 등 — 저장만 실패하고 전환은 유지 */
    }
    setLight(next);
  };

  const isActive = (t: (typeof tabs)[number]) => {
    const paths = t.match ?? [t.href.split('?')[0]];
    // '/' 는 모든 경로의 접두사라 정확히 일치할 때만 활성 처리
    return paths.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`)));
  };

  return (
    <header
      className="sticky top-0 z-40 flex h-[60px] items-center gap-3 border-b px-5 backdrop-blur-[14px] sm:gap-6"
      style={{ background: 'var(--header-bg)', borderColor: 'var(--line)' }}
    >
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 text-[15px] font-extrabold tracking-tight"
      >
        <span className="grid h-6 shrink-0 place-items-center rounded-md bg-brand px-1.5 text-[12px] font-black text-brand-foreground">
          새로이
        </span>
        <span className="hidden sm:inline">대시보드</span>
      </Link>

      {/* 모바일: 가로 스크롤 가능. 데스크탑: 그대로 */}
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-[13.5px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const active = isActive(t);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={
                'shrink-0 rounded-[10px] px-3 py-[7px] font-bold theme-fade ' +
                (active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')
              }
              style={active ? { background: 'var(--chip)' } : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2 text-[13.5px] text-muted-foreground">
        <button
          onClick={toggleTheme}
          className="theme-fade h-[30px] shrink-0 rounded-[10px] border px-[11px] text-[12.5px] font-bold text-foreground"
          style={{ background: 'var(--chip)', borderColor: 'var(--line)' }}
          title="다크 / 라이트 전환"
        >
          {light ? '라이트' : '다크'}
        </button>
        <Link
          href="/settings/api-keys"
          className="hidden rounded-lg px-2 py-1.5 font-semibold hover:text-foreground sm:inline-block"
        >
          API 키
        </Link>
        <Link
          href="/settings"
          className="rounded-lg px-2 py-1.5 font-semibold hover:text-foreground"
        >
          설정
        </Link>
      </div>
    </header>
  );
}
