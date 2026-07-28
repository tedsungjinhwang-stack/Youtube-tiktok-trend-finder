import { prisma } from '@/lib/db';
import { PresetsClient } from './presets-client';
import { IntegrationCards, type Integration } from './integration-cards';

export const dynamic = 'force-dynamic';

function isMissingTable(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /relation .* does not exist|P2021|does not exist/i.test(msg);
}

export default async function SettingsPage() {
  let presets: Awaited<ReturnType<typeof prisma.scrapePreset.findMany>> = [];
  let warning: string | null = null;
  try {
    presets = await prisma.scrapePreset.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  } catch (e) {
    if (isMissingTable(e)) {
      warning =
        'DB 마이그레이션 미실행 (ScrapePreset). prisma/migrations/20260623000000_scrape_preset/migration.sql 실행 필요.';
    } else {
      warning = `로드 실패: ${(e as Error).message.slice(0, 200)}`;
    }
  }
  const folders = await prisma.folder
    .findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
    .catch(() => []);
  const integrations = await loadIntegrations();
  return (
    <div>
      <div className="mx-auto max-w-[1100px] px-5 pt-6">
        <IntegrationCards items={integrations} />
      </div>
      <PresetsClient
        initial={presets.map((p) => ({
          ...p,
          lastRunAt: p.lastRunAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        }))}
        folders={folders}
        warning={warning}
      />
    </div>
  );
}

/** 연동 상태를 DB 에서 실제로 계산 (하드코딩 금지) */
async function loadIntegrations(): Promise<Integration[]> {
  const [ytKeys, apify, todoist, google] = await Promise.all([
    prisma.youtubeApiKey.count({ where: { isActive: true } }).catch(() => 0),
    prisma.credential.findUnique({ where: { service: 'APIFY_TOKEN' } }).catch(() => null),
    prisma.todoistConfig.findUnique({ where: { id: 'default' } }).catch(() => null),
    prisma.googleOAuth.findUnique({ where: { id: 'default' } }).catch(() => null),
  ]);
  return [
    {
      title: 'YouTube API 키',
      connected: ytKeys > 0,
      statusLabel: ytKeys > 0 ? `${ytKeys}개 활성` : '미등록',
      description: '트렌딩·채널 수집에 사용. 키를 여러 개 등록하면 할당량 소진 시 자동 순환합니다.',
      href: '/settings/youtube-keys',
    },
    {
      title: 'Apify 토큰',
      connected: !!apify,
      description: 'TikTok·Instagram 등 비-YouTube 플랫폼 스크래핑에 사용합니다.',
      href: '/settings/api-keys',
    },
    {
      title: 'Todoist',
      connected: !!todoist,
      statusLabel: todoist ? `프로젝트 "${todoist.projectName}"` : '미연결',
      description: '채널별 발행 예약을 태스크로 동기화합니다. 개인 API 토큰은 만료되지 않습니다.',
      href: '/channel-dashboard',
    },
    {
      title: 'Google Calendar',
      connected: !!google,
      description: '캘린더 연동은 Todoist 로 대체되었습니다. 필요할 때만 사용하세요.',
      href: '/settings/api-keys',
    },
  ];
}
