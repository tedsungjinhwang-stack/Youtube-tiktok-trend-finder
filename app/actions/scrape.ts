'use server';

import { revalidatePath } from 'next/cache';
import { scrapeByPlatforms } from '@/lib/scraper';

type Platform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU' | 'DOUYIN';

export type ScrapeActionResult =
  | { ok: true; dispatched: number; ok_count: number; failed: number }
  | { ok: false; error: string };

const REVALIDATE_PATHS = ['/all', '/youtube', '/social', '/xiaohongshu', '/douyin'];

export async function scrapePlatformsAction(
  platforms: Platform[],
  folderId?: string
): Promise<ScrapeActionResult> {
  try {
    const r = await scrapeByPlatforms(
      platforms.length > 0 ? platforms : undefined,
      folderId && folderId !== 'all' ? folderId : undefined
    );
    for (const p of REVALIDATE_PATHS) revalidatePath(p);
    return { ok: true, dispatched: r.dispatched, ok_count: r.ok, failed: r.failed };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? '스크랩 실패' };
  }
}
