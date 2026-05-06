export default function SettingsPage() {
  return (
    <div className="container py-8">
      <h1 className="mb-2 text-2xl font-bold">설정</h1>
      <p className="mb-6 text-muted-foreground">
        임계치, 수집 주기, 인증.
      </p>

      <div className="space-y-4">
        <div className="rounded border p-4">
          <div className="font-medium">터진 영상 임계치</div>
          <div className="text-sm text-muted-foreground">
            기본: viralScore ≥ 3 AND views ≥ 50K
          </div>
        </div>
        <div className="rounded border p-4">
          <div className="font-medium">심정지 영상 임계치</div>
          <div className="text-sm text-muted-foreground">
            기본: viralScore ≥ 7 AND views ≥ 300K
          </div>
        </div>
        <div className="rounded border p-4">
          <div className="font-medium">수집 주기</div>
          <div className="text-sm text-muted-foreground">
            Vercel Cron 일 1회 (KST 03:00). 채널별 수동 트리거 가능.
          </div>
        </div>
      </div>
    </div>
  );
}
