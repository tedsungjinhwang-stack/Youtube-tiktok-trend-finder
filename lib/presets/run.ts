import { prisma } from '@/lib/db';
import { scrapeByPlatforms } from '@/lib/scraper';
import type { Platform, ScrapePreset } from '@prisma/client';

const VALID_PLATFORMS: Platform[] = [
  'YOUTUBE',
  'TIKTOK',
  'INSTAGRAM',
  'XIAOHONGSHU',
  'DOUYIN',
];

/**
 * 프리셋 실행 — 1) 해당 폴더+플랫폼 채널 재스크랩, 2) 필터 조건으로 매칭 영상 수 계산
 * lastRunAt / lastMatched / lastError 갱신.
 */
export async function runPreset(preset: ScrapePreset): Promise<{
  preset: { id: string; name: string };
  scraped: { dispatched: number; ok: number; failed: number };
  matched: number;
  filter: PresetFilter;
}> {
  const platform = VALID_PLATFORMS.includes(preset.platform as Platform)
    ? (preset.platform as Platform)
    : null;
  const folderId = preset.folderId ?? undefined;
  const now = new Date();

  let scraped = { dispatched: 0, ok: 0, failed: 0 };
  let matched = 0;
  let error: string | null = null;

  try {
    // 1) 재스크랩 — 폴더 + 플랫폼 한정.
    //    최근(recencyDays)만이면 최신 50개로 충분 → 빠름.
    //    옛날(minAgeDays)이 있으면 깊이 파야 함 → 1000개 (단, 수동 전용이라 504 위험 낮음).
    const maxVideos = preset.minAgeDays != null ? 1000 : 50;
    scraped = await scrapeByPlatforms(
      platform ? [platform] : undefined,
      folderId,
      { maxVideos }
    );

    // 2) 필터 조건으로 매칭 영상 수 카운트
    matched = await prisma.video.count({ where: buildVideoWhere(preset, now) });
  } catch (e) {
    error = (e as Error).message.slice(0, 300);
  }

  await prisma.scrapePreset.update({
    where: { id: preset.id },
    data: {
      lastRunAt: now,
      lastMatched: matched,
      lastScraped: scraped.dispatched,
      lastError: error,
    },
  });

  if (error) throw new Error(error);

  return {
    preset: { id: preset.id, name: preset.name },
    scraped,
    matched,
    filter: presetToFilter(preset),
  };
}

export type PresetFilter = {
  folderId: string | null;
  platform: string;
  kind: string;
  recencyDays: number | null;
  minAgeDays: number | null;
  minViews: number;
  videoType: string;
};

export function presetToFilter(p: ScrapePreset): PresetFilter {
  return {
    folderId: p.folderId,
    platform: p.platform,
    kind: p.kind,
    recencyDays: p.recencyDays,
    minAgeDays: p.minAgeDays,
    minViews: p.minViews,
    videoType: p.videoType,
  };
}

function buildVideoWhere(p: ScrapePreset, now: Date) {
  const channelWhere: {
    folderId?: string;
    kind?: string;
    platform?: Platform;
  } = {};
  if (p.folderId) channelWhere.folderId = p.folderId;
  if (p.kind !== 'ALL') channelWhere.kind = p.kind;
  if (VALID_PLATFORMS.includes(p.platform as Platform)) {
    channelWhere.platform = p.platform as Platform;
  }

  const published: { gte?: Date; lte?: Date } = {};
  if (p.recencyDays != null) {
    published.gte = new Date(now.getTime() - p.recencyDays * 86_400_000);
  }
  if (p.minAgeDays != null) {
    published.lte = new Date(now.getTime() - p.minAgeDays * 86_400_000);
  }

  const isShorts =
    p.videoType === 'SHORTS' ? true : p.videoType === 'LONG' ? false : undefined;

  return {
    channel: channelWhere,
    ...(p.minViews > 0 ? { viewCount: { gte: BigInt(p.minViews) } } : {}),
    ...(Object.keys(published).length > 0 ? { publishedAt: published } : {}),
    ...(isShorts !== undefined ? { isShorts } : {}),
  };
}

/** 프리셋 → /all 페이지 query string (사용자가 클릭해 결과 영상 보러갈 때) */
export function presetToAllQuery(p: ScrapePreset): string {
  const params = new URLSearchParams();
  if (p.folderId) params.set('folderId', p.folderId);
  if (p.platform) params.set('platforms', p.platform);
  if (p.recencyDays != null) {
    if (p.recencyDays <= 1) params.set('period', '24h');
    else if (p.recencyDays <= 2) params.set('period', '48h');
    else if (p.recencyDays <= 7) params.set('period', '7d');
    else if (p.recencyDays <= 30) params.set('period', '30d');
    else params.set('period', 'all');
  }
  if (p.minViews > 0) params.set('minViews', String(p.minViews));
  params.set('sortBy', 'views');
  return params.toString();
}
