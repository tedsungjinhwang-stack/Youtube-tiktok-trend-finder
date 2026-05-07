/**
 * YouTube 실시간 인기 급상승 (mostPopular chart).
 *
 * Endpoint: GET /youtube/v3/videos
 *   part=snippet,statistics,contentDetails
 *   chart=mostPopular
 *   regionCode=KR (or US, JP, ...)
 *   maxResults=50 (max), pageToken for >50
 *
 * Quota cost: 1 unit per page (50 results) — cheap.
 */

import { getActiveKey, markUsed, markExhausted } from './keyManager';

export type TrendingRegion = 'KR' | 'US' | 'JP' | 'GB' | 'DE' | 'FR' | 'IN' | 'BR';

export type TrendingVideo = {
  rank: number;
  videoId: string;
  url: string;
  title: string;
  thumbnailUrl: string;
  channelId: string;
  channelName: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
  durationSeconds: number;
  isShorts: boolean;
  region: TrendingRegion;
};

const API = 'https://www.googleapis.com/youtube/v3/videos';

export async function fetchTrending(
  region: TrendingRegion = 'KR',
  pages = 1
): Promise<TrendingVideo[]> {
  const out: TrendingVideo[] = [];
  let pageToken: string | undefined;
  let rank = 0;

  for (let i = 0; i < pages; i++) {
    const key = await getActiveKey();
    if (!key) throw new Error('YouTube API 키 없음 — /settings/api-keys 등록');

    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      chart: 'mostPopular',
      regionCode: region,
      maxResults: '50',
      key: key.apiKey,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const resp = await fetch(`${API}?${params}`);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      if (resp.status === 403 && /quota/i.test(body)) {
        await markExhausted(key.id, body.slice(0, 200));
        throw new Error('quota_exhausted');
      }
      throw new Error(`youtube ${resp.status}: ${body.slice(0, 200)}`);
    }

    const json = (await resp.json()) as YtVideosResponse;
    await markUsed(key.id, 1);

    for (const it of json.items ?? []) {
      rank++;
      const dur = parseIsoDurationSeconds(it.contentDetails?.duration ?? '');
      out.push({
        rank,
        videoId: it.id,
        url: `https://www.youtube.com/watch?v=${it.id}`,
        title: it.snippet?.title ?? '',
        thumbnailUrl:
          it.snippet?.thumbnails?.medium?.url ??
          it.snippet?.thumbnails?.default?.url ??
          '',
        channelId: it.snippet?.channelId ?? '',
        channelName: it.snippet?.channelTitle ?? '',
        publishedAt: it.snippet?.publishedAt ?? '',
        viewCount: Number(it.statistics?.viewCount ?? 0),
        likeCount: it.statistics?.likeCount != null ? Number(it.statistics.likeCount) : null,
        commentCount:
          it.statistics?.commentCount != null ? Number(it.statistics.commentCount) : null,
        durationSeconds: dur,
        isShorts: dur > 0 && dur <= 60,
        region,
      });
    }

    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  return out;
}

export function parseIsoDurationSeconds(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

type YtVideosResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: {
        default?: { url?: string };
        medium?: { url?: string };
        high?: { url?: string };
      };
    };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails?: { duration?: string };
  }>;
  nextPageToken?: string;
};
