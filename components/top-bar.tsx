import Link from 'next/link';

const tabs = [
  { href: '/discovery', label: '커뮤니티/뉴스' },
  { href: '/popular-feed', label: '해시태그검색' },
  { href: '/trending', label: '실시간 인기' },
  { href: '/all?platforms=YOUTUBE', label: '영상 조회' },
  { href: '/channels', label: '에셋 채널' },
  { href: '/stock', label: '소재창고' },
  { href: '/folders', label: '폴더' },
  { href: '/comment-generator', label: '댓글생성기' },
  { href: '/my-schedule', label: '채널 스케줄' },
];

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur sm:gap-6 sm:px-4">
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 text-[16px] font-bold tracking-tight"
      >
        <span className="grid h-6 w-6 place-items-center rounded bg-foreground text-[12px] font-black text-background">
          T
        </span>
        <span className="hidden sm:inline">Trend Finder</span>
      </Link>

      {/* 모바일: 가로 스크롤 가능. 데스크탑: 그대로 */}
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="shrink-0 rounded-md px-3 py-1.5 font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/settings/api-keys"
          className="hidden rounded-md px-2 py-1 hover:bg-accent hover:text-foreground sm:inline-block"
        >
          API 키
        </Link>
        <Link
          href="/settings"
          className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
        >
          설정
        </Link>
      </div>
    </header>
  );
}
