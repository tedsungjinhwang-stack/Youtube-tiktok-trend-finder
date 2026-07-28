import Link from 'next/link';

export type Integration = {
  title: string;
  connected: boolean;
  /** 연결됨/미연결 대신 쓸 상태 문구 (예: "3개 활성") */
  statusLabel?: string;
  description: string;
  href: string;
};

/** 설정 상단 연동 상태 카드 4장 */
export function IntegrationCards({ items }: { items: Integration[] }) {
  return (
    <div className="mb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
      {items.map((it) => (
        <Link
          key={it.title}
          href={it.href}
          className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-[color:var(--border-hover)]"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[14px] font-extrabold tracking-tight">{it.title}</span>
            <span
              className="shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-bold"
              style={
                it.connected
                  ? { background: 'rgba(116,190,140,0.13)', color: '#74BE8C' }
                  : { background: '#252A2F', color: '#8A939C' }
              }
            >
              {it.statusLabel ?? (it.connected ? '연결됨' : '미연결')}
            </span>
          </div>
          <p className="mt-2 text-[12.5px] font-semibold leading-relaxed text-muted-foreground">
            {it.description}
          </p>
        </Link>
      ))}
    </div>
  );
}
