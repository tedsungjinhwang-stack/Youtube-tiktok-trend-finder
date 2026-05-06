import type { Channel } from '@prisma/client';
import { scrapeYoutube } from './youtube';
import { scrapeApifyTiktok, scrapeApifyInstagram } from './apify';

export async function scrapeChannel(c: Channel) {
  switch (c.platform) {
    case 'YOUTUBE':
      return scrapeYoutube(c);
    case 'TIKTOK':
      return scrapeApifyTiktok(c);
    case 'INSTAGRAM':
      return scrapeApifyInstagram(c);
  }
}
