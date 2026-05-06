export default function HomePage() {
  return (
    <div className="container py-8">
      <h1 className="mb-2 text-2xl font-bold">홈</h1>
      <p className="text-muted-foreground">
        에셋 채널 트렌드 요약. 첫 PR에서는 더미 화면입니다.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: '등록 폴더', value: '–' },
          { label: '등록 채널', value: '–' },
          { label: '오늘 수집', value: '–' },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
