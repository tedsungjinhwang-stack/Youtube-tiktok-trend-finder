import { cookies } from 'next/headers';
import { ThresholdsForm } from './thresholds-form';
import {
  BUILTIN_DEFAULTS,
  COOKIE_KEY_MIN_VIEWS,
  numFromCookie,
} from '@/lib/settings';
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
  const cronSchedules = parseCronSchedules(
    (vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? []
  );
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

        <Card title="자동 작업 (Cron)" subtitle="현재 활성 cron 만 표시. 스케줄은 vercel.json (배포 후 적용)">
          <CronRow
            label="캘린더 동기화"
            hint="활성 채널의 예약영상을 Google Calendar 에 반영 (지난 예약은 자동 정리 → '영상업로드 필요')"
            schedule={cronSchedules['/api/cron/calendar-sync']}
          >
            <span className="text-[12px] text-success">항상 ON</span>
          </CronRow>

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

function parseCronSchedules(
  crons: { path: string; schedule: string }[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of crons) {
    out[c.path] = `${c.schedule} (UTC) → ${cronToKst(c.schedule)}`;
  }
  return out;
}

function cronToKst(cron: string): string {
  const [minute, hour] = cron.split(' ');
  if (hour === '*') return '매시간';
  const h = parseInt(hour, 10);
  if (isNaN(h)) return cron;
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

function CronRow({
  label,
  hint,
  schedule,
  children,
}: {
  label: string;
  hint?: string;
  schedule?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 text-[14px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium">{label}</div>
          {hint && (
            <div className="mt-0.5 text-[12px] text-muted-foreground/80">
              {hint}
            </div>
          )}
          {schedule && (
            <div className="num mt-1 text-[13px] text-muted-foreground/70">
              {schedule}
            </div>
          )}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
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
