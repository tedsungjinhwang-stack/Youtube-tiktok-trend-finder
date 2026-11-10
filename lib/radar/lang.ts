/**
 * 한국어 채널 판별 — 채널 이름에 한글이 있거나, 모아 둔 영상 제목 중 한글이 든 비율(Channel.koRatio)이 30% 이상.
 * 기회판(outlook)·터진 영상이 같은 기준을 쓴다.
 * koRatio 는 하루 한 번 미리 계산(radar-precompute) — 전체 영상 제목을 훑어 작은 DB 에서 40초쯤이라 화면에서 하지 않는다.
 */

import { prisma } from '@/lib/db';

export const KO_TITLE_RATIO = 0.3;

/** 모든 채널의 한글 제목 비율을 다시 계산 — 바뀐 채널만 쓴다 */
export async function refreshChannelLang(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "Channel" c SET "koRatio" = l.ko
    FROM (SELECT "channelId", AVG((title ~ '[가-힣]')::int)::float8 AS ko FROM "RadarVideo" GROUP BY 1) l
    WHERE c.id = l."channelId" AND (c."koRatio" IS NULL OR abs(c."koRatio" - l.ko) > 0.02)`;
}
