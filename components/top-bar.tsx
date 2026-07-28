'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/channel-dashboard', label: '채널 대시보드', match: ['/channel-dashboard', '/my-schedule'] },
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

  const isActive = (t: (typeof tabs)[number]) => {
    const paths = t.match ?? [t.href.split('?')[0]];
    return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-5 backdrop-blur-xl sm:gap-6">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 text-[15px] font-extrabold tracking-tight"
      >
        <span className="grid h-6 w-6 place-items-center rounded-md bg-brand text-[12px] font-black text-brand-foreground">
          T
        </span>
        <span className="hidden sm:inline">Trend Finder</span>
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
                'shrink-0 rounded-lg px-3 py-1.5 transition-colors ' +
                (active
                  ? 'bg-secondary font-bold text-foreground'
                  : 'font-semibold text-muted-foreground hover:text-foreground')
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-1 text-[13.5px] text-muted-foreground">
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
