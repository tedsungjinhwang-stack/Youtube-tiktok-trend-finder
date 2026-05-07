import Link from 'next/link';

const tabs = [
  { href: '/popular-feed', label: '인기피드검색' },
  { href: '/', label: '통합' },
  { href: '/youtube', label: 'YouTube' },
  { href: '/social', label: 'TikTok / Insta' },
  { href: '/trending', label: '실시간 인기' },
  { href: '/channels', label: '에셋 채널' },
  { href: '/folders', label: '폴더' },
];

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-6 border-b bg-background/80 px-4 backdrop-blur">
      <Link
        href="/"
        className="flex items-center gap-2 text-[16px] font-bold tracking-tight"
      >
        <span className="grid h-6 w-6 place-items-center rounded bg-foreground text-[12px] font-black text-background">
          T
        </span>
        Trend Finder
      </Link>

      <nav className="flex items-center gap-1 text-sm">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-md px-3 py-1.5 font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/settings/api-keys"
          className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
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
