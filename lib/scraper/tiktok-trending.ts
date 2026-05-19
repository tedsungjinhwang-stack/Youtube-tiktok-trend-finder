/**
 * TikTok 트렌딩 (KR) — apidojo/tiktok-scraper actor 사용.
 *
 * 진짜 country trending API 가 TikTok 에 없어, location=KR + sortType=MOST_LIKED +
 * 트렌딩 키워드 조합으로 KR 인기 영상을 가져옴.
 *
 * 비용: $0.30 / 1k posts.
 */

import { ApifyClient } from 'apify-client';
import { getCred } from '@/lib/credentials';

const KR_TRENDING_KEYWORDS = ['fyp', 'kpop', 'korea', 'kdrama', 'kfood', '한국'];

export type TiktokTrendingVideo = {
  videoId: string;
  url: string;
  title: string;
  channelId: string;
  channelName: string;
  thumbnailUrl: string | null;
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
  durationSeconds: number;
  publishedAt: string;
  isShorts: true;
};

export async function fetchTiktokTrending(
  region: string = 'KR',
  maxItems = 200
): Promise<TiktokTrendingVideo[]> {
  const token = await getCred('APIFY_API_TOKEN');
  if (!token) throw new Error('APIFY_API_TOKEN 미설정 — /settings/api-keys 에서 등록');
  const client = new ApifyClient({ token });

  const run = await client.actor('apidojo/tiktok-scraper').call({
    keywords: KR_TRENDING_KEYWORDS,
    sortType: 'MOST_LIKED',
    location: region, // ISO 3166-1 alpha-2 (KR)
    maxItems,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  // apidojo/tiktok-scraper 응답 필드 매핑 (clockworks 와 비슷하지만 일부 다를 수 있음)
  const seen = new Set<string>();
  const out: TiktokTrendingVideo[] = [];
  for (const raw of items) {
    const i = raw as Record<string, unknown> & {
      id?: string;
      aweme_id?: string;
      webVideoUrl?: string;
      videoUrl?: string;
      url?: string;
      text?: string;
      desc?: string;
      videoMeta?: { coverUrl?: string; duration?: number };
      coverUrl?: string;
      cover?: string;
      playCount?: number;
      stats?: { playCount?: number; diggCount?: number; commentCount?: number };
      diggCount?: number;
      commentCount?: number;
      authorMeta?: { id?: string; name?: string; uniqueId?: string; nickName?: string };
      author?: { id?: string; uniqueId?: string; nickname?: string };
      createTimeISO?: string;
      createTime?: number;
    };
    const videoId = i.id ?? i.aweme_id ?? '';
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);

    const viewCount =
      i.playCount ?? i.stats?.playCount ?? 0;
    const likeCount =
      i.diggCount ?? i.stats?.diggCount ?? null;
    const commentCount =
      i.commentCount ?? i.stats?.commentCount ?? null;

    out.push({
      videoId,
      url: i.webVideoUrl ?? i.videoUrl ?? i.url ?? '',
      title: i.text ?? i.desc ?? '',
      channelId: i.authorMeta?.id ?? i.author?.id ?? i.authorMeta?.uniqueId ?? i.author?.uniqueId ?? '',
      channelName:
        i.authorMeta?.nickName ??
        i.author?.nickname ??
        i.authorMeta?.name ??
        i.authorMeta?.uniqueId ??
        i.author?.uniqueId ??
        '',
      thumbnailUrl: i.videoMeta?.coverUrl ?? i.coverUrl ?? i.cover ?? null,
      viewCount: Number(viewCount),
      likeCount: likeCount != null ? Number(likeCount) : null,
      commentCount: commentCount != null ? Number(commentCount) : null,
      durationSeconds: i.videoMeta?.duration ?? 0,
      publishedAt:
        i.createTimeISO ??
        (i.createTime ? new Date(i.createTime * 1000).toISOString() : new Date().toISOString()),
      isShorts: true,
    });
  }

  out.sort((a, b) => b.viewCount - a.viewCount);
  return out;
}
