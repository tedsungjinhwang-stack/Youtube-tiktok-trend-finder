export default function ChannelsPage() {
  const folders = [
    { name: '영드짜', count: 12 },
    { name: '해외 영드짜', count: 5 },
    { name: '예능짜집기', count: 8 },
    { name: '국뽕', count: 3 },
    { name: '해짜 (동물)', count: 6 },
    { name: '감동', count: 8 },
  ];

  return (
    <div className="px-4 py-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">에셋 채널</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            폴더로 묶어 관리. YT/TT/IG 한 폴더 안에 같이 가능.
          </p>
        </div>
        <div className="flex gap-1.5 text-[12.5px]">
          <button className="rounded-lg border bg-card px-3 py-1.5 hover:border-foreground/40">
            + 폴더
          </button>
          <button className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-brand-foreground hover:bg-brand/90">
            + 채널
          </button>
          <button className="rounded-lg border bg-card px-3 py-1.5 hover:border-foreground/40">
            CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {folders.map((f) => (
          <div
            key={f.name}
            className="rounded-xl border bg-card p-4 transition hover:border-foreground/30"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-brand/15 text-[11px] font-bold text-brand">
                  {f.name.slice(0, 1)}
                </span>
                <span className="text-[14px] font-semibold">{f.name}</span>
                <span className="num text-[11.5px] text-muted-foreground">
                  ({f.count})
                </span>
              </div>
              <button className="text-[11px] text-muted-foreground hover:text-foreground">
                편집
              </button>
            </div>

            <ul className="space-y-1 text-[12.5px]">
              {Array.from({ length: Math.min(3, f.count) }).map((_, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5"
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-secondary text-[9px] font-bold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="truncate">channel_{i + 1}</span>
                  <span className="ml-auto num text-[11px] text-muted-foreground">
                    {(Math.random() * 100).toFixed(0)}K
                  </span>
                </li>
              ))}
              {f.count > 3 && (
                <li className="px-2 text-[11px] text-muted-foreground">
                  + {f.count - 3}개 더보기
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
