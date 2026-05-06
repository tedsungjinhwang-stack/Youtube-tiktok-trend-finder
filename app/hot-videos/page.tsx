export default function HotVideosPage() {
  return (
    <div className="container py-8">
      <h1 className="mb-2 text-2xl font-bold">터진 영상</h1>
      <p className="mb-6 text-muted-foreground">
        viralScore ≥ 3 AND views ≥ 50K (기본). 임계치 슬라이더로 조정 예정.
      </p>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <span className="rounded border px-3 py-1.5">폴더: 전체</span>
        <span className="rounded border px-3 py-1.5">플랫폼: ALL</span>
        <span className="rounded border px-3 py-1.5">기간: 7d</span>
        <span className="rounded border px-3 py-1.5">정렬: viralScore</span>
      </div>

      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        영상 그리드가 여기에 렌더링됩니다 (실데이터 연결 후).
      </div>
    </div>
  );
}
