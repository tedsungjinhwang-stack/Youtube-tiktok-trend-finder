import { prisma } from '@/lib/db';

/** 채널 하나를 하루 감시하는 데 드는 유튜브 할당량 어림 */
/** 관심 목록 (매시간: 채널 통계 0.5 + 새 영상 1~2 + 조회수 3~4) */
export const UNITS_PER_WATCHED_CHANNEL = 5.5;
/** 나머지 전체 (6시간 채널 통계 0.1 + 새 영상 ~1 + 3~12시간 조회수 ~0.6) */
export const UNITS_PER_OTHER_CHANNEL = 1.7;
/** 나머지도 매시간 잴 때 (채널 통계 0.5 + 새 영상 ~0.5 + 조회수 ~1.5 — 관심 목록 팩보다 올리는 영상이 적다) */
export const UNITS_PER_OTHER_CHANNEL_HOURLY = 2.5;
/** 전체를 매시간 재는 데 드는 몫이 키 한도 합의 이만큼 안이면 전체 매시간 (나머지는 과거 트래픽·여유) */
const ALL_HOURLY_SHARE = 0.75;

export type MonitorPlan = {
  /** 관심 목록이 아닌 채널도 매시간 재나 */
  allHourly: boolean;
  /** 등록된 키 하루 한도 합 */
  limit: number;
  watched: number;
  others: number;
  /** 하루 감시 예상 할당량 (지금 방식대로) */
  need: number;
};

/** 키가 넉넉하면 살아있는 채널 전부 매시간, 모자라면 관심 목록만 매시간·나머지 3~6시간 */
export async function monitorPlan(): Promise<MonitorPlan> {
  const [keys, watched, others] = await Promise.all([
    prisma.youtubeApiKey.findMany({ where: { isActive: true }, select: { dailyQuotaLimit: true } }).catch(() => []),
    prisma.channel.count({ where: { isActive: true, platform: 'YOUTUBE', folder: { watched: true } } }).catch(() => 0),
    prisma.channel.count({ where: { isActive: true, platform: 'YOUTUBE', folder: { watched: false } } }).catch(() => 0),
  ]);
  const limit = keys.reduce((a, k) => a + k.dailyQuotaLimit, 0);
  const base = watched * UNITS_PER_WATCHED_CHANNEL + 600;
  const hourlyNeed = base + others * UNITS_PER_OTHER_CHANNEL_HOURLY;
  const allHourly = limit > 0 && hourlyNeed <= limit * ALL_HOURLY_SHARE;
  return {
    allHourly,
    limit,
    watched,
    others,
    need: Math.round(allHourly ? hourlyNeed : base + others * UNITS_PER_OTHER_CHANNEL),
  };
}
