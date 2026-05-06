import { CredentialList } from '@/components/credential-list';

export default function ApiKeysPage() {
  const ytKeys = [
    { label: '메인1', tail: 'XYZ', used: 3200, limit: 10000, status: 'active' as const },
    { label: '메인2', tail: 'ABC', used: 800, limit: 10000, status: 'active' as const },
    { label: '메인3', tail: 'DEF', used: 10000, limit: 10000, status: 'exhausted' as const },
  ];
  const ytTotal = ytKeys.reduce((s, k) => s + k.used, 0);
  const ytTotalLimit = ytKeys.reduce((s, k) => s + k.limit, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">API 키 통합 관리</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          여기서 바로 추가·수정·삭제 가능. 부팅 시점에 필요한 값(DATABASE_URL,
          Supabase 키)은 .env 전용입니다.
        </p>
        <p className="mt-1 text-[10.5px] text-muted-foreground/80">
          현재 메모리 저장 (서버 재시작 시 초기화). DB 연결 후 영구 저장으로 자동
          전환됩니다.
        </p>
      </div>

      <Section
        title="YouTube Data API"
        desc="quota 소진 시 자동 로테이션. PT 자정(KST 17:00) 자동 리셋."
        action={
          <button className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-foreground hover:bg-brand/90">
            + 키 추가
          </button>
        }
      >
        <div className="rounded-xl border bg-card p-4">
          <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
            전체 quota
          </div>
          <div className="num mt-1 text-2xl font-bold tabular-nums">
            {ytTotal.toLocaleString()}
            <span className="ml-1 text-[14px] font-normal text-muted-foreground">
              / {ytTotalLimit.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-border">
            <div
              className="h-full bg-brand"
              style={{ width: `${(ytTotal / ytTotalLimit) * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y divide-border/60">
            {ytKeys.map((k) => {
              const pct = (k.used / k.limit) * 100;
              return (
                <li key={k.label} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        'grid h-6 w-6 place-items-center rounded-full text-[11px] ' +
                        (k.status === 'active'
                          ? 'bg-success/20 text-success'
                          : 'bg-warning/20 text-warning')
                      }
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
                      className={
                        'rounded px-2 py-0.5 text-[10.5px] ' +
                        (k.status === 'active'
                          ? 'border border-success/40 text-success'
                          : 'border border-warning/40 text-warning')
                      }
                    >
                      {k.status === 'active' ? '활성' : '고갈 (17시 리셋)'}
                    </span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded bg-border">
                    <div
                      className={
                        'h-full ' +
                        (k.status === 'active' ? 'bg-foreground/70' : 'bg-warning')
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>

      <Section
        title="외부 서비스"
        desc="여기서 바로 입력해서 저장. 빨간 × 표시는 미설정 상태입니다."
      >
        <CredentialList />
      </Section>

      <Section title="가입·발급 가이드">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <GuideRow
            name="YouTube Data API v3"
            steps="Google Cloud Console → 프로젝트 생성 → API 사용 설정 → 사용자 인증 정보 → API 키"
            href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
          />
          <GuideRow
            name="Apify"
            steps="apify.com 가입 → Settings → Integrations → Personal API tokens"
            href="https://console.apify.com/account/integrations"
          />
          <GuideRow
            name="Supabase"
            steps="supabase.com 가입 → 새 프로젝트(서울 리전) → Project Settings → API"
            href="https://supabase.com/dashboard"
          />
          <GuideRow
            name="OpenClaw"
            steps="아무 무작위 문자열을 직접 만들어 입력 (예: openssl rand -hex 32)"
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-bold tracking-tight">{title}</h2>
          {desc && (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{desc}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function GuideRow({
  name,
  steps,
  href,
}: {
  name: string;
  steps: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">{name}</span>
        {href && (
          <span className="text-[10.5px] text-muted-foreground">↗ 열기</span>
        )}
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{steps}</p>
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border bg-card p-3 transition hover:border-foreground/30"
    >
      {inner}
    </a>
  ) : (
    <div className="rounded-lg border bg-card p-3">{inner}</div>
  );
}
