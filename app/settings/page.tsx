import { cookies } from 'next/headers';
import { ThresholdsForm } from './thresholds-form';
import { AutoScrapeToggle } from './auto-scrape-toggle';
import {
  BUILTIN_DEFAULTS,
  COOKIE_KEY_MIN_VIEWS,
  numFromCookie,
} from '@/lib/settings';
import { getAutoScrapeEnabled } from '@/lib/system-settings';
import vercelConfig from '@/vercel.json';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const c = cookies();
  const defaults = {
    minViews: numFromCookie(
      c.get(COOKIE_KEY_MIN_VIEWS)?.value,
      BUILTIN_DEFAULTS.minViews
    ),
  };
  const autoScrapeEnabled = await getAutoScrapeEnabled();
  const cronInfo = describeCrons(vercelConfig.crons ?? []);
  const ownerEmail = process.env.OWNER_EMAIL;
  const openclawSet = !!process.env.OPENCLAW_API_KEY;
  const cronSecretSet = !!process.env.CRON_SECRET;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="text-lg font-bold tracking-tight">설정</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        임계치, 수집 주기, 인증.
      </p>

      <div className="mt-5 space-y-3">
        <Card title="기본 임계치" subtitle="홈/YouTube/Social 페이지 필터의 초기값. URL 파라미터로 덮어쓸 수 있음.">
          <div className="px-4 py-3">
            <ThresholdsForm initial={defaults} />
          </div>
        </Card>

        <Card title="수집 주기" subtitle="vercel.json — 배포 후 적용. 변경하려면 파일 직접 수정 + 재배포.">
          <RowToggle
            label="자동 수집 활성화"
            hint={autoScrapeEnabled ? 'cron 시간이 되면 자동 스크래핑 실행' : 'cron이 와도 스킵'}
          >
            <AutoScrapeToggle initial={autoScrapeEnabled} />
          </RowToggle>
          {cronInfo.map((c) => (
            <Row key={c.path} label={c.label} value={c.schedule} />
          ))}
          <Row label="채널별 수동 트리거" value="활성 (채널 페이지에서)" />
        </Card>

        <Card title="인증">
          <Row
            label="OWNER_EMAIL"
            value={ownerEmail ?? '(미설정)'}
            tone={ownerEmail ? 'ok' : 'warn'}
          />
          <Row
            label="OPENCLAW_API_KEY"
            value={openclawSet ? '설정됨 (Bearer 인증 활성)' : '(미설정)'}
            tone={openclawSet ? 'ok' : 'warn'}
          />
          <Row
            label="CRON_SECRET"
            value={cronSecretSet ? '설정됨' : '(미설정)'}
            tone={cronSecretSet ? 'ok' : 'warn'}
          />
        </Card>
      </div>
    </div>
  );
}

function describeCrons(
  crons: { path: string; schedule: string }[]
): { path: string; label: string; schedule: string }[] {
  return crons.map((c) => ({
    path: c.path,
    label: labelForCronPath(c.path),
    schedule: `${c.schedule} (UTC) → ${cronToKst(c.schedule)}`,
  }));
}

function labelForCronPath(path: string): string {
  if (path.includes('scrape-all')) return '자동 스크래핑';
  if (path.includes('reset-youtube-quotas')) return 'YT 쿼터 리셋';
  return path;
}

function cronToKst(cron: string): string {
  const [minute, hour] = cron.split(' ');
  const h = parseInt(hour, 10);
  if (isNaN(h)) return `KST 변환 실패 (${cron})`;
  const kst = (h + 9) % 24;
  return `매일 KST ${String(kst).padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-2.5">
        <div className="text-[13.5px] font-semibold">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-[12px] text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function RowToggle({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]">
      <div className="flex-1">
        <div className="text-muted-foreground">{label}</div>
        {hint && (
          <div className="mt-0.5 text-[12px] text-muted-foreground/70">
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  const valueColor =
    tone === 'warn'
      ? 'text-warning'
      : tone === 'ok'
        ? 'text-success'
        : 'text-foreground';
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-[14px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${valueColor}`}>{value}</span>
    </div>
  );
}
