export default function LoginPage() {
  return (
    <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background">
          <span className="text-lg font-black">T</span>
        </div>
        <h1 className="text-[18px] font-bold tracking-tight">Trend Finder</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">
          Google 계정 로그인 · 이메일 화이트리스트
        </p>
        <button className="mt-5 w-full rounded-lg border bg-background/40 px-4 py-2.5 text-[14px] font-medium hover:border-foreground/40 hover:bg-accent">
          Google로 계속하기
        </button>
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          OWNER_EMAIL 환경변수에 등록된 이메일만 접근 가능합니다.
        </p>
      </div>
    </div>
  );
}
