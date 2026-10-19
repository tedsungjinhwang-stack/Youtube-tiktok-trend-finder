import { prisma } from '@/lib/db';
import { IntegrationCards, type Integration } from './integration-cards';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const integrations = await loadIntegrations();
  return (
    <div>
      <div className="mx-auto max-w-[1100px] px-5 pt-6">
        <IntegrationCards items={integrations} />
      </div>
    </div>
  );
}

/** 연동 상태를 DB 에서 실제로 계산 (하드코딩 금지) */
async function loadIntegrations(): Promise<Integration[]> {
  const [todoist, google] = await Promise.all([
    prisma.todoistConfig.findUnique({ where: { id: 'default' } }).catch(() => null),
    prisma.googleOAuth.findUnique({ where: { id: 'default' } }).catch(() => null),
  ]);
  return [
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
      description: '채널별 발행 예약을 구글 캘린더 일정으로 동기화합니다.',
      href: '/settings/api-keys',
    },
  ];
}
