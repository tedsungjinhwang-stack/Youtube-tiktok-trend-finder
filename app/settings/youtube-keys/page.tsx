export default function YoutubeKeysPage() {
  const keys = [
    { label: '메인1', tail: 'XYZ', used: 3200, limit: 10000, status: 'active' as const },
    { label: '메인2', tail: 'ABC', used: 800, limit: 10000, status: 'active' as const },
    { label: '메인3', tail: 'DEF', used: 10000, limit: 10000, status: 'exhausted' as const },
  ];

  const total = keys.reduce((s, k) => s + k.used, 0);
  const totalLimit = keys.reduce((s, k) => s + k.limit, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">YouTube API 키</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            quota 소진 시 자동 로테이션. PT 자정(KST 17시) 자동 리셋.
          </p>
        </div>
        <button className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90">
          + 키 추가
        </button>
      </div>

      <div className="mb-4 rounded-xl border bg-card p-4">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
          전체 quota
        </div>
        <div className="num mt-1 text-2xl font-bold tabular-nums">
          {total.toLocaleString()}
          <span className="ml-1 text-[14px] font-normal text-muted-foreground">
            / {totalLimit.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-border">
          <div
            className="h-full bg-brand"
            style={{ width: `${(total / totalLimit) * 100}%` }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <ul className="divide-y divide-border/60">
          {keys.map((k) => {
            const pct = (k.used / k.limit) * 100;
            return (
              <li key={k.label} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${
                      k.status === 'active'
                        ? 'bg-success/20 text-success'
                        : 'bg-warning/20 text-warning'
                    }`}
                  >
                    {k.status === 'active' ? '✓' : '!'}
                  </span>
                  <span className="text-[13.5px] font-semibold">{k.label}</span>
                  <span className="num text-[11.5px] text-muted-foreground">
                    AIza***{k.tail}
                  </span>
                  <span className="ml-auto num text-[12.5px] tabular-nums">
                    {k.used.toLocaleString()}{' '}
                    <span className="text-muted-foreground">
                      / {k.limit.toLocaleString()}
                    </span>
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10.5px] ${
                      k.status === 'active'
                        ? 'border border-success/40 text-success'
                        : 'border border-warning/40 text-warning'
                    }`}
                  >
                    {k.status === 'active' ? '활성' : '고갈 (17시 리셋)'}
                  </span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded bg-border">
                  <div
                    className={`h-full ${
                      k.status === 'active' ? 'bg-foreground/70' : 'bg-warning'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
