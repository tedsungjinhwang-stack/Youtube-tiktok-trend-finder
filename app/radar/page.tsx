import { prisma } from '@/lib/db';
import type { RadarData } from '@/lib/radar/types';
import { getRadarData } from '@/lib/radar/works';
import { RadarClient } from './radar-client';

export const dynamic = 'force-dynamic';

const EMPTY: RadarData = {
  collectedAt: new Date(0).toISOString(),
  monitoredChannels: 0,
  groups: [],
  summary: { surgingShorts: 0, risingWorks: 0, honeyPots: 0, crowded: 0, matchRate: 0 },
  rising: [],
  crowded: [],
  unmatched: [],
};

/** 꿀통레이더 — 수집기(lib/radar/collect)가 모은 감시 채널 영상과 작품 인식(lib/radar/match)으로 */
export default async function Page() {
  const folders = await prisma.folder
    .findMany({
      where: { channels: { some: { platform: 'YOUTUBE' } } },
      select: { id: true, name: true },
      orderBy: [{ watched: 'desc' }, { sortOrder: 'asc' }],
    })
    .catch(() => []);
  const data = await getRadarData('3d').catch(() => EMPTY);
  // 시스템 폴더(__로 시작)는 뺀다 — Prisma startsWith 는 '_' 를 LIKE 와일드카드로 넘겨서 JS 에서 거른다
  return <RadarClient data={data} folders={folders.filter((f) => !f.name.startsWith('__'))} />;
}
