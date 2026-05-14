import { CredentialList } from '@/components/credential-list';
import { YoutubeKeyList } from '@/components/youtube-key-list';
import { OpenAIOAuthPanel } from './openai-oauth-panel';

export default function ApiKeysPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-5">
      <div>
        <h1 className="text-lg font-bold tracking-tight">API 키 통합 관리</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          여기서 바로 추가·수정·삭제 가능. 부팅 시점에 필요한 값(DATABASE_URL,
          Supabase 키)은 .env 전용입니다.
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground/80">
          현재 메모리 저장 (서버 재시작 시 초기화). DB 연결 후 영구 저장으로 자동
          전환됩니다.
        </p>
      </div>

      <YoutubeKeyList />

      <Section
        title="OpenAI 인증"
        desc="ChatGPT 계정으로 OAuth 로그인하면 API key 없이 chat/completions 호출 가능 (우회 방식 · 차단 시 API key 자동 fallback)."
      >
        <OpenAIOAuthPanel />
      </Section>

      <Section
        title="외부 서비스"
        desc="여기서 바로 입력해서 저장. 빨간 × 표시는 미설정 상태입니다."
      >
        <CredentialList />
      </Section>

      <Section title="가입·발급 가이드">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <GuideRow
            name="YouTube Data API v3"
            steps="Google Cloud Console → 프로젝트 생성 → API 사용 설정 → 사용자 인증 정보 → API 키"
            href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
          />
          <GuideRow
            name="Apify"
            steps="apify.com 가입 → Settings → Integrations → Personal API tokens"
            href="https://console.apify.com/account/integrations"
          />
          <GuideRow
            name="Supabase"
            steps="supabase.com 가입 → 새 프로젝트(서울 리전) → Project Settings → API"
            href="https://supabase.com/dashboard"
          />
          <GuideRow
            name="OpenClaw"
            steps="아무 무작위 문자열을 직접 만들어 입력 (예: openssl rand -hex 32)"
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
          {desc && (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{desc}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function GuideRow({
  name,
  steps,
  href,
}: {
  name: string;
  steps: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold">{name}</span>
        {href && (
          <span className="text-[11.5px] text-muted-foreground">↗ 열기</span>
        )}
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{steps}</p>
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border bg-card p-3 transition hover:border-foreground/30"
    >
      {inner}
    </a>
  ) : (
    <div className="rounded-lg border bg-card p-3">{inner}</div>
  );
}
