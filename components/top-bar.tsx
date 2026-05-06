import Link from 'next/link';

const tabs = [
  { href: '/hot-videos', label: 'HOT', sub: '터진' },
  { href: '/viral-alerts', label: 'VIRAL', sub: '심정지' },
  { href: '/channels', label: 'CHANNELS', sub: '채널' },
  { href: '/folders', label: 'FOLDERS', sub: '폴더' },
];

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-6 border-b bg-background/80 px-4 backdrop-blur">
      <Link
        href="/"
        className="flex items-center gap-2 text-[15px] font-bold tracking-tight"
      >
        <span className="grid h-6 w-6 place-items-center rounded bg-foreground text-[11px] font-black text-background">
          T
        </span>
        Trend Finder
      </Link>

      <nav className="flex items-center gap-1 text-sm">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <span className="font-semibold tracking-wide">{t.label}</span>
            <span className="ml-1.5 text-[11px] text-muted-foreground/70">
              {t.sub}
            </span>
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/settings/youtube-keys"
          className="rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
        >
          YT 키
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
