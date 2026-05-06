export default function YoutubeKeysPage() {
  return (
    <div className="container py-8">
      <h1 className="mb-2 text-2xl font-bold">YouTube API 키</h1>
      <p className="mb-6 text-muted-foreground">
        Google Cloud 프로젝트 N개 = 일일 quota N×10,000. quota 소진 시 자동 로테이션.
      </p>

      <div className="mb-4 flex gap-2 text-sm">
        <button className="rounded border px-3 py-1.5">+ 키 추가</button>
      </div>

      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        등록된 키가 없습니다. 첫 키를 추가하세요.
      </div>
    </div>
  );
}
