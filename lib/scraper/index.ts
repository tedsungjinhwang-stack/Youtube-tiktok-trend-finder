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

async function persistVideos(c: Channel, videos: ScrapedVideo[]) {
  for (const v of videos) {
    await prisma.video.upsert({
      where: {
        platform_externalId: { platform: c.platform, externalId: v.externalId },
      },
      create: {
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
      },
      update: {
        viewCount: v.viewCount,
        likeCount: v.likeCount ?? null,
        commentCount: v.commentCount ?? null,
        shareCount: v.shareCount ?? null,
        fetchedAt: new Date(),
      },
    });
  }
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
