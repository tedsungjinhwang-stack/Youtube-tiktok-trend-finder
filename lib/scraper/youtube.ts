import type { Channel } from '@prisma/client';

export type ScrapedVideo = {
  externalId: string;
  url: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  viewCount: bigint;
  likeCount?: number | null;
  commentCount?: number | null;
  durationSeconds?: number | null;
  isShorts?: boolean | null;
  publishedAt: Date;
};

export type ScrapeResult = {
  videos: ScrapedVideo[];
  quotaUsed: number;
};

/**
 * Stub. Real impl:
 * 1. channels.list?forHandle=@xxx → channelId (1 quota, only on first scrape)
 * 2. uploads playlist = "UU" + channelId.slice(2)
 * 3. playlistItems.list (1 quota)
 * 4. videos.list?id=batch50 (1 quota per 50)
 * 5. ISO duration parse → isShorts ≤ 60s
 */
export async function scrapeYoutube(_channel: Channel): Promise<ScrapeResult> {
  throw new Error('scrapeYoutube: not implemented');
}
