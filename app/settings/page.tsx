export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="text-lg font-bold tracking-tight">설정</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        임계치, 수집 주기, 인증.
      </p>

      <div className="mt-5 space-y-3">
        <Card title="HOT (터진 영상) 임계치">
          <Row label="최소 viralScore" value="3" />
          <Row label="최소 조회수" value="50,000" />
        </Card>

        <Card title="VIRAL (심정지) 임계치">
          <Row label="최소 viralScore" value="7" />
          <Row label="최소 조회수" value="300,000" />
        </Card>

        <Card title="수집 주기">
          <Row label="자동 수집" value="일 1회 (KST 03:00)" />
          <Row label="채널별 수동 트리거" value="활성" />
        </Card>

        <Card title="인증">
          <Row label="OWNER_EMAIL" value="환경변수에 등록" />
          <Row label="OPENCLAW_API_KEY" value="Bearer 인증 활성" />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-2.5 text-[12.5px] font-semibold">
        {title}
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
