/**
 * 시스템 단위 설정 — DB의 Credential 테이블 재사용 (단일 사용자 전제).
 * service 키는 SYS_ 프리픽스로 일반 자격증명과 구분.
 *
 * cron 같은 서버사이드 코드도 읽어야 해서 cookie 대신 DB 사용.
 */

import { prisma } from '@/lib/db';

const KEY_AUTO_SCRAPE = 'SYS_AUTO_SCRAPE_ENABLED';

const DEFAULTS = {
  autoScrapeEnabled: true,
} as const;

export async function getAutoScrapeEnabled(): Promise<boolean> {
  try {
    const row = await prisma.credential.findUnique({
      where: { service: KEY_AUTO_SCRAPE },
    });
    if (!row) return DEFAULTS.autoScrapeEnabled;
    return row.value === '1' || row.value === 'true';
  } catch {
    return DEFAULTS.autoScrapeEnabled;
  }
}

export async function setAutoScrapeEnabled(enabled: boolean): Promise<void> {
  await prisma.credential.upsert({
    where: { service: KEY_AUTO_SCRAPE },
    create: {
      service: KEY_AUTO_SCRAPE,
      value: enabled ? '1' : '0',
      description: '자동 스크래핑 cron 활성 여부',
    },
    update: { value: enabled ? '1' : '0' },
  });
}
