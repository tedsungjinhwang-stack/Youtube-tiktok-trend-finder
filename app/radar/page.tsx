import { prisma } from '@/lib/db';
import { RadarClient } from './radar-client';
import { RADAR_MOCK } from './mock';

export const dynamic = 'force-dynamic';

/**
 * 꿀통레이더 — 채널 순위·터진 영상·관심 목록은 실제 데이터(lib/radar/collect 가 모은 것),
 * 작품 단위 꿀통 화면은 아직 시안(예시 데이터).
 */
export default async function Page() {
  const folders = await prisma.folder
    .findMany({
      where: { channels: { some: { platform: 'YOUTUBE' } } },
      select: { id: true, name: true },
      orderBy: [{ watched: 'desc' }, { sortOrder: 'asc' }],
    })
    .catch(() => []);
  // 시스템 폴더(__로 시작)는 뺀다 — Prisma startsWith 는 '_' 를 LIKE 와일드카드로 넘겨서 JS 에서 거른다
  return <RadarClient data={RADAR_MOCK} folders={folders.filter((f) => !f.name.startsWith('__'))} />;
}
