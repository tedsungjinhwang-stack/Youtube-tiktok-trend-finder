export default function ChannelsPage() {
  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">에셋 채널</h1>
        <div className="flex gap-2 text-sm">
          <button className="rounded border px-3 py-1.5">+ 폴더 추가</button>
          <button className="rounded border px-3 py-1.5">+ 채널 추가</button>
          <button className="rounded border px-3 py-1.5">CSV 임포트</button>
        </div>
      </div>

      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        폴더별 채널 트리가 여기에 렌더링됩니다.
      </div>
    </div>
  );
}
