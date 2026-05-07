/**
 * Scraper orchestration: dispatch by platform, persist to DB, recompute viralScore.
 */

import type { Channel } from '@prisma/client';
import { prisma } from '@/lib/db';
import { scrapeYoutube } from './youtube';
import {
  scrapeApifyTiktok,
  scrapeApifyInstagram,
  type ScrapedVideo,
  type ScrapeResult,
} from './apify';
import { inferFormat } from '@/lib/format';

export async function scrapeChannel(c: Channel): Promise<ScrapeResult> {
  const start = Date.now();
  const run = await prisma.scrapeRun.create({
    data: {
      channelId: c.id,
      platform: c.platform,
      status: 'RUNNING',
    },
  });

  try {
    const result =
      c.platform === 'YOUTUBE'
        ? await scrapeYoutube(c)
        : c.platform === 'TIKTOK'
          ? await scrapeApifyTiktok(c)
          : await scrapeApifyInstagram(c);

    await persistVideos(c, result.videos);
    await prisma.channel.update({
      where: { id: c.id },
      data: { lastScrapedAt: new Date() },
    });
    await recomputeViralScores(c.id);

    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: 'OK',
        itemsCount: result.videos.length,
        quotaUsed: result.quotaUsed,
        finishedAt: new Date(),
      },
    });
    return result;
  } catch (e) {
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: (e as Error).message.slice(0, 500),
        finishedAt: new Date(),
      },
    });
    throw e;
  }
}

/** 자동 스크래핑 정책: 최근 48시간 이내 게시 + DB에 없는 영상만 신규로 저장 */
const SCRAPE_RECENCY_HOURS = 48;

async function persistVideos(c: Channel, videos: ScrapedVideo[]) {
  const cutoff = new Date(Date.now() - SCRAPE_RECENCY_HOURS * 60 * 60 * 1000);
  const recent = videos.filter((v) => v.publishedAt >= cutoff);
  if (recent.length === 0) return;

  const externalIds = recent.map((v) => v.externalId);
  const existing = await prisma.video.findMany({
    where: { platform: c.platform, externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalId));

  const fresh = recent.filter((v) => !existingSet.has(v.externalId));
  if (fresh.length === 0) return;

  await prisma.video.createMany({
    data: fresh.map((v) => ({
      channelId: c.id,
      platform: c.platform,
      externalId: v.externalId,
      url: v.url,
      caption: v.caption ?? null,
      thumbnailUrl: v.thumbnailUrl ?? null,
      viewCount: v.viewCount,
      likeCount: v.likeCount ?? null,
      commentCount: v.commentCount ?? null,
      shareCount: v.shareCount ?? null,
      durationSeconds: v.durationSeconds ?? null,
      isShorts: v.isShorts ?? null,
      publishedAt: v.publishedAt,
      format: inferFormat({
        caption: v.caption ?? null,
        durationSeconds: v.durationSeconds,
        isShorts: v.isShorts,
      }),
      formatLockedBy: 'auto',
    })),
    skipDuplicates: true,
  });
}

/** viralScore = video views / avg(channel.recent 20 videos views) */
export async function recomputeViralScores(channelId: string): Promise<void> {
  const recent = await prisma.video.findMany({
    where: { channelId },
    orderBy: { publishedAt: 'desc' },
    take: 20,
    select: { viewCount: true },
  });
  if (recent.length === 0) return;

  const sum = recent.reduce((s, v) => s + Number(v.viewCount), 0);
  const avg = sum / recent.length;
  if (avg <= 0) return;

  const all = await prisma.video.findMany({
    where: { channelId },
    select: { id: true, viewCount: true },
  });

  await prisma.$transaction(
    all.map((v) =>
      prisma.video.update({
        where: { id: v.id },
        data: { viralScore: Number(v.viewCount) / avg },
      })
    )
  );
}

export async function scrapeAllActive(): Promise<{
  dispatched: number;
  ok: number;
  failed: number;
}> {
  const channels = await prisma.channel.findMany({ where: { isActive: true } });
  let ok = 0,
    failed = 0;
  for (const c of channels) {
    try {
      await scrapeChannel(c);
      ok++;
    } catch {
      failed++;
    }
  }
  return { dispatched: channels.length, ok, failed };
}
