export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border p-6 text-center">
        <h1 className="mb-2 text-xl font-bold">Trend Finder</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Google 계정으로 로그인 (이메일 화이트리스트).
        </p>
        <button className="w-full rounded border px-4 py-2 text-sm hover:bg-accent">
          Google로 계속하기
        </button>
        <p className="mt-4 text-xs text-muted-foreground">
          OWNER_EMAIL 환경변수에 등록된 이메일만 접근 가능합니다.
        </p>
      </div>
    </div>
  );
}
