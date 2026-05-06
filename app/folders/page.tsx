export default function FoldersPage() {
  return (
    <div className="container py-8">
      <h1 className="mb-2 text-2xl font-bold">폴더 관리</h1>
      <p className="mb-6 text-muted-foreground">
        이름 변경/추가/삭제/정렬. 기본 19개 시드 다시 불러오기 가능.
      </p>

      <div className="mb-4 flex gap-2 text-sm">
        <button className="rounded border px-3 py-1.5">+ 새 폴더</button>
        <button className="rounded border px-3 py-1.5">
          기본 19개 시드 다시 불러오기
        </button>
      </div>

      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        폴더 리스트 (드래그 정렬).
      </div>
    </div>
  );
}
