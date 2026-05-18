/**
 * TikTok 트렌딩 (KR) — clockworks/tiktok-scraper actor 로
 * 한국 트렌딩 해시태그 모음의 인기 영상을 묶어서 가져옴.
 *
 * TikTok 은 공식 글로벌 trending API 가 없어, 한국 관련 인기 태그들에서
 * 가장 조회수 높은 영상들을 모은 뒤 dedupe + 정렬.
 */

import { ApifyClient } from 'apify-client';
import { getCred } from '@/lib/credentials';

const KR_TRENDING_HASHTAGS = [
  'fyp',
  'kpop',
  'koreatiktok',
  'korea',
  'kdrama',
  'kfood',
];

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
  resultsPerTag = 30
): Promise<TiktokTrendingVideo[]> {
  const token = await getCred('APIFY_API_TOKEN');
  if (!token) throw new Error('APIFY_TOKEN 미설정 — /settings/api-keys 에서 등록');
  const client = new ApifyClient({ token });

  // KR 외 region 도 일단 같은 태그 모음으로 (확장 시 region 별 태그 분기 가능)
  const tags = region === 'KR' ? KR_TRENDING_HASHTAGS : ['fyp', 'foryou', 'viral'];

  const run = await client.actor('clockworks/tiktok-scraper').call({
    hashtags: tags,
    resultsPerPage: resultsPerTag,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadAvatars: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadMusicCovers: false,
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  // dedupe by videoId, sort by viewCount desc
  const seen = new Set<string>();
  const out: TiktokTrendingVideo[] = [];
  for (const it of items) {
    const i = it as Record<string, unknown> & {
      id?: string;
      aweme_id?: string;
      webVideoUrl?: string;
      videoUrl?: string;
      text?: string;
      videoMeta?: { coverUrl?: string; duration?: number };
      coverUrl?: string;
      playCount?: number;
      diggCount?: number;
      commentCount?: number;
      authorMeta?: { id?: string; name?: string; uniqueId?: string; nickName?: string };
      createTimeISO?: string;
      createTime?: number;
    };
    const videoId = i.id ?? i.aweme_id ?? '';
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);

    out.push({
      videoId,
      url: i.webVideoUrl ?? i.videoUrl ?? '',
      title: i.text ?? '',
      channelId: i.authorMeta?.id ?? i.authorMeta?.uniqueId ?? '',
      channelName: i.authorMeta?.nickName ?? i.authorMeta?.name ?? i.authorMeta?.uniqueId ?? '',
      thumbnailUrl: i.videoMeta?.coverUrl ?? i.coverUrl ?? null,
      viewCount: Number(i.playCount ?? 0),
      likeCount: i.diggCount != null ? Number(i.diggCount) : null,
      commentCount: i.commentCount != null ? Number(i.commentCount) : null,
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
