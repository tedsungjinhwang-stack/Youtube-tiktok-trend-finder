import Link from 'next/link';

const sections: { title: string; items: { href: string; label: string }[] }[] = [
  {
    title: '핵심',
    items: [
      { href: '/', label: '홈' },
      { href: '/hot-videos', label: '터진 영상' },
      { href: '/viral-alerts', label: '심정지 영상' },
    ],
  },
  {
    title: '관리',
    items: [
      { href: '/channels', label: '에셋 채널' },
      { href: '/folders', label: '폴더' },
      { href: '/settings/youtube-keys', label: 'YT API 키' },
    ],
  },
  {
    title: '기타',
    items: [
      { href: '/settings', label: '설정' },
      { href: '/login', label: '로그인' },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r bg-secondary/30 p-4">
      <Link href="/" className="mb-6 block text-lg font-bold">
        Trend Finder
      </Link>
      <nav className="space-y-6 text-sm">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {s.title}
            </div>
            <ul className="space-y-1">
              {s.items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className="block rounded px-2 py-1.5 hover:bg-accent"
                  >
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
