/**
 * Apify scraping for TikTok / Instagram.
 *
 * Profile mode  (registered asset channels): scrape latest videos from a handle.
 * Hashtag mode  (popular feed discovery):    scrape videos under one or more hashtags.
 *
 * Pay-per-result pricing: TikTok $1.70/1k, Instagram $1.50/1k.
 * Keep `resultsPerPage` / `resultsLimit` small to control cost.
 */

import { ApifyClient } from 'apify-client';
import { getCred } from '@/lib/credentials';
import type { Channel } from '@prisma/client';

export type ScrapedVideo = {
  externalId: string;
  url: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  viewCount: bigint;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  durationSeconds?: number | null;
  isShorts?: boolean | null;
  publishedAt: Date;
};

export type ScrapeResult = {
  videos: ScrapedVideo[];
  quotaUsed: number; // result count (proxy for billable units)
};

async function getClient(): Promise<ApifyClient> {
  const token = await getCred('APIFY_API_TOKEN');
  if (!token) throw new Error('APIFY_API_TOKEN 미설정 — /settings/api-keys 에서 등록');
  return new ApifyClient({ token });
}

/* ------------------------- profile (asset channel) mode ------------------------- */

export async function scrapeApifyTiktok(
  channel: Channel,
  resultsPerPage = 30
): Promise<ScrapeResult> {
  const client = await getClient();
  const handle = stripAt(channel.handle ?? channel.externalId);

  const run = await client.actor('clockworks/tiktok-scraper').call({
    profiles: [handle],
    resultsPerPage,
    profileSorting: 'latest',
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadAvatars: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadMusicCovers: false,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { videos: items.map(mapTiktok), quotaUsed: items.length };
}

export async function scrapeApifyInstagram(
  channel: Channel,
  resultsLimit = 30
): Promise<ScrapeResult> {
  const client = await getClient();
  const handle = stripAt(channel.handle ?? channel.externalId);

  const run = await client.actor('apify/instagram-scraper').call({
    username: [handle],
    resultsType: 'posts',
    resultsLimit,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { videos: items.map(mapInstagram), quotaUsed: items.length };
}

/* ------------------------------ hashtag mode ----------------------------------- */

export async function scrapeApifyTiktokByHashtag(
  hashtags: string[],
  resultsPerPage = 30
): Promise<ScrapeResult> {
  if (hashtags.length === 0) return { videos: [], quotaUsed: 0 };
  const client = await getClient();

  const run = await client.actor('clockworks/tiktok-scraper').call({
    hashtags: hashtags.map(stripHash),
    resultsPerPage,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadAvatars: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadMusicCovers: false,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { videos: items.map(mapTiktok), quotaUsed: items.length };
}

export async function scrapeApifyInstagramByHashtag(
  hashtag: string,
  resultsLimit = 30
): Promise<ScrapeResult> {
  const client = await getClient();

  const run = await client.actor('apify/instagram-scraper').call({
    search: stripHash(hashtag),
    searchType: 'hashtag',
    searchLimit: 1,
    resultsType: 'posts',
    resultsLimit,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { videos: items.map(mapInstagram), quotaUsed: items.length };
}

/* --------------------------------- mappers ------------------------------------- */

function mapTiktok(it: any): ScrapedVideo {
  // clockworks/tiktok-scraper item fields
  return {
    externalId: it.id ?? it.aweme_id ?? String(it.videoUrl ?? ''),
    url: it.webVideoUrl ?? it.videoUrl ?? '',
    caption: it.text ?? null,
    thumbnailUrl: it.videoMeta?.coverUrl ?? it.coverUrl ?? null,
    viewCount: BigInt(it.playCount ?? 0),
    likeCount: it.diggCount ?? null,
    commentCount: it.commentCount ?? null,
    shareCount: it.shareCount ?? null,
    durationSeconds: it.videoMeta?.duration ?? null,
    isShorts: true,
    publishedAt: new Date((it.createTimeISO ?? it.createTime * 1000) ?? Date.now()),
  };
}

function mapInstagram(it: any): ScrapedVideo {
  // apify/instagram-scraper item fields
  return {
    externalId: it.id ?? it.shortCode ?? '',
    url: it.url ?? `https://www.instagram.com/p/${it.shortCode}/`,
    caption: it.caption ?? null,
    thumbnailUrl: it.displayUrl ?? it.thumbnailUrl ?? null,
    viewCount: BigInt(it.videoViewCount ?? it.videoPlayCount ?? 0),
    likeCount: it.likesCount ?? null,
    commentCount: it.commentsCount ?? null,
    durationSeconds: it.videoDuration ?? null,
    isShorts: it.type === 'Video',
    publishedAt: new Date(it.timestamp ?? Date.now()),
  };
}

function stripAt(s: string): string {
  return s.replace(/^@/, '');
}
function stripHash(s: string): string {
  return s.replace(/^#/, '');
}
