export default function ViralAlertsPage() {
  return (
    <div className="container py-8">
      <h1 className="mb-2 text-2xl font-bold">심정지 영상</h1>
      <p className="mb-6 text-muted-foreground">
        viralScore ≥ 7 AND views ≥ 300K. 극단적으로 터진 영상.
      </p>

      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        심정지급 영상 그리드 (실데이터 연결 후).
      </div>
    </div>
  );
}
