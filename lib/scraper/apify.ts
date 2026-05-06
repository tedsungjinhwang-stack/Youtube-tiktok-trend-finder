import type { Channel } from '@prisma/client';
import type { ScrapeResult } from './youtube';

/**
 * Stub. Real impl uses apify-client:
 * - TikTok: clockworks/tiktok-scraper, profiles: ['@xxx'], resultsPerPage: 30, profileSorting: 'latest'
 * - Instagram: apify/instagram-scraper, username: ['xxx'], resultsType: 'posts', resultsLimit: 30
 */
export async function scrapeApifyTiktok(_channel: Channel): Promise<ScrapeResult> {
  throw new Error('scrapeApifyTiktok: not implemented');
}

export async function scrapeApifyInstagram(_channel: Channel): Promise<ScrapeResult> {
  throw new Error('scrapeApifyInstagram: not implemented');
}
