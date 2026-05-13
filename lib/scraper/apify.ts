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
  /** 해시태그 검색 시 작성자 채널 자동 등록용 — 핸들 (TT/IG 위주) */
  authorHandle?: string | null;
  /** YouTube 채널 ID (UC...) — 가능하면 핸들보다 우선 사용 */
  authorChannelId?: string | null;
  /** 채널 표시명 — DB에 저장해서 카드/상세에 노출 */
  authorDisplayName?: string | null;
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
  resultsPerPage = 100
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
  resultsLimit = 100
): Promise<ScrapeResult> {
  const client = await getClient();
  const tag = stripHash(hashtag);

  // instaprism/instagram-hashtag-scraper — pay-per-result ($3.80/1k), 페이지 하드 제한 없음.
  const run = await client.actor('instaprism/instagram-hashtag-scraper').call({
    hashtags: [tag],
    resultsLimit,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { videos: items.map(mapInstagram), quotaUsed: items.length };
}

/* ----------------------------- Xiaohongshu (RedNote) --------------------------- */

/**
 * 샤오홍수 프로필 모드 — 등록된 채널의 유저 포스트 fetch.
 * Actor: zhorex/rednote-xiaohongshu-scraper (all-in-one).
 * Input: userUrl (full profile URL) + mode=user_posts.
 */
export async function scrapeApifyXiaohongshu(
  channel: Channel,
  maxResults = 30
): Promise<ScrapeResult> {
  const client = await getClient();
  const userUrl = buildXhsUserUrl(channel);

  const run = await client.actor('zhorex/rednote-xiaohongshu-scraper').call({
    mode: 'user_posts',
    userUrl,
    maxResults,
    includeComments: false,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { videos: items.map(mapXiaohongshu), quotaUsed: items.length };
}

/** 샤오홍수 해시태그/검색어 모드 — 인기피드 발견용. */
export async function scrapeApifyXiaohongshuByHashtag(
  hashtag: string,
  maxResults = 50
): Promise<ScrapeResult> {
  const client = await getClient();
  const tag = stripHash(hashtag);

  const run = await client.actor('zhorex/rednote-xiaohongshu-scraper').call({
    mode: 'search',
    searchQuery: tag,
    sortBy: 'popularity_descending',
    filterByType: 'all',
    maxResults,
    includeComments: false,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { videos: items.map(mapXiaohongshu), quotaUsed: items.length };
}

/* --------------------------------- Douyin -------------------------------------- */

/**
 * 도우인 프로필 모드 — 등록된 채널의 유저 포스트 fetch.
 * Actor: natanielsantos/douyin-scraper.
 * Input: profileUrls (or UserSecIDs) + maxItemsPerUrl.
 */
export async function scrapeApifyDouyin(
  channel: Channel,
  maxItemsPerUrl = 30
): Promise<ScrapeResult> {
  const client = await getClient();
  const profileUrl = buildDouyinUserUrl(channel);

  const run = await client.actor('natanielsantos/douyin-scraper').call({
    profileUrls: [profileUrl],
    maxItemsPerUrl,
    shouldDownloadVideos: false,
    scrapePlayCount: true,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return { videos: items.map(mapDouyin), quotaUsed: items.length };
}

/* --------------------------------- mappers ------------------------------------- */

function mapTiktok(it: any): ScrapedVideo {
  // clockworks/tiktok-scraper item fields
  const authorHandle = it.authorMeta?.name
    ? '@' + String(it.authorMeta.name).toLowerCase()
    : it.authorMeta?.uniqueId
      ? '@' + String(it.authorMeta.uniqueId).toLowerCase()
      : null;
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
    authorHandle,
  };
}

function mapInstagram(it: any): ScrapedVideo {
  // apify/instagram-scraper or instagram-hashtag-scraper 둘 다 처리
  const authorHandle = it.ownerUsername
    ? '@' + String(it.ownerUsername).toLowerCase()
    : null;
  return {
    externalId: it.id ?? it.shortCode ?? '',
    url: it.url ?? `https://www.instagram.com/p/${it.shortCode}/`,
    caption: it.caption ?? null,
    thumbnailUrl: it.displayUrl ?? it.thumbnailUrl ?? null,
    viewCount: BigInt(it.videoViewCount ?? it.videoPlayCount ?? it.viewsCount ?? 0),
    likeCount: it.likesCount ?? null,
    commentCount: it.commentsCount ?? null,
    durationSeconds: it.videoDuration ?? null,
    isShorts: it.type === 'Video' || it.productType === 'clips',
    publishedAt: new Date(it.timestamp ?? it.takenAtTimestamp ?? Date.now()),
    authorHandle,
  };
}

function stripAt(s: string): string {
  return s.replace(/^@/, '');
}
function stripHash(s: string): string {
  return s.replace(/^#/, '');
}

/** Channel(handle 또는 externalId) → 샤오홍수 유저 프로필 URL */
function buildXhsUserUrl(channel: Channel): string {
  const raw = (channel.externalId || channel.handle || '').replace(/^@/, '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.xiaohongshu.com/user/profile/${raw}`;
}

/** Channel → 도우인 유저 프로필 URL */
function buildDouyinUserUrl(channel: Channel): string {
  const raw = (channel.externalId || channel.handle || '').replace(/^@/, '');
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.douyin.com/user/${raw}`;
}

function mapXiaohongshu(it: any): ScrapedVideo {
  // zhorex/rednote-xiaohongshu-scraper 출력 (필드명은 보수적으로 여러 형태 대응)
  const userId = it.user?.userId ?? it.userId ?? it.author?.userId ?? null;
  const userNick = it.user?.nickname ?? it.author?.nickname ?? it.nickname ?? null;
  const userHandle = userNick ? '@' + String(userNick).toLowerCase().replace(/\s+/g, '_') : null;
  const noteId = it.noteId ?? it.id ?? it.note?.id ?? '';
  const url =
    it.url ??
    it.noteUrl ??
    (noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '');
  const ts = it.publishTime ?? it.createTime ?? it.timestamp ?? null;
  const dur = it.video?.duration ?? it.duration ?? null;
  return {
    externalId: noteId,
    url,
    caption: it.title ?? it.desc ?? it.content ?? null,
    thumbnailUrl: it.cover?.url ?? it.coverUrl ?? it.thumbnail ?? null,
    viewCount: BigInt(it.viewCount ?? it.views ?? it.interactInfo?.viewCount ?? 0),
    likeCount: it.likeCount ?? it.likes ?? it.interactInfo?.likedCount ?? null,
    commentCount: it.commentCount ?? it.interactInfo?.commentCount ?? null,
    shareCount: it.shareCount ?? it.interactInfo?.shareCount ?? null,
    durationSeconds: typeof dur === 'number' ? dur : null,
    isShorts: true,
    publishedAt: ts ? new Date(typeof ts === 'number' ? ts : Date.parse(ts)) : new Date(),
    authorHandle: userHandle,
    authorChannelId: userId ? String(userId) : null,
    authorDisplayName: userNick ?? null,
  };
}

function mapDouyin(it: any): ScrapedVideo {
  // natanielsantos/douyin-scraper 출력
  const author = it.author ?? it.authorInfo ?? {};
  const userHandle = author.uniqueId
    ? '@' + String(author.uniqueId).toLowerCase()
    : author.nickname
      ? '@' + String(author.nickname).toLowerCase().replace(/\s+/g, '_')
      : null;
  const aid = it.awemeId ?? it.id ?? it.videoId ?? '';
  const url =
    it.shareUrl ??
    it.url ??
    (aid ? `https://www.douyin.com/video/${aid}` : '');
  const ts = it.createTime ?? it.publishTime ?? null;
  return {
    externalId: aid,
    url,
    caption: it.desc ?? it.title ?? null,
    thumbnailUrl: it.cover?.urlList?.[0] ?? it.coverUrl ?? it.thumbnail ?? null,
    viewCount: BigInt(it.statistics?.playCount ?? it.playCount ?? 0),
    likeCount: it.statistics?.diggCount ?? it.diggCount ?? null,
    commentCount: it.statistics?.commentCount ?? it.commentCount ?? null,
    shareCount: it.statistics?.shareCount ?? it.shareCount ?? null,
    durationSeconds: typeof it.duration === 'number' ? Math.round(it.duration / 1000) : null,
    isShorts: true,
    publishedAt: ts ? new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts) : new Date(),
    authorHandle: userHandle,
    authorChannelId: author.secUid ?? author.uid ?? null,
    authorDisplayName: author.nickname ?? null,
  };
}
