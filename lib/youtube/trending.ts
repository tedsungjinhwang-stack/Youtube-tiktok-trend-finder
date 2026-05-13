/**
 * YouTube 실시간 인기 급상승 (mostPopular chart) — 채널파인더 동일 방식.
 *
 * 단일 엔드포인트로 200개(4페이지) 가져온 뒤 isShorts 필터로 롱폼/쇼츠 분기.
 *   part=snippet,statistics,contentDetails
 *   chart=mostPopular
 *   regionCode=KR (or US, JP, ...)
 *   maxResults=50, pageToken for >50
 *
 * Quota: 1 unit per page × 4 = 4 units/region. search.list 안 씀.
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
  pages = 4
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
      const isShorts = dur > 0 && dur <= 60;
      out.push({
        rank,
        videoId: it.id,
        url: isShorts
          ? `https://www.youtube.com/shorts/${it.id}`
          : `https://www.youtube.com/watch?v=${it.id}`,
        title: it.snippet?.title ?? '',
        thumbnailUrl: `https://img.youtube.com/vi/${it.id}/maxresdefault.jpg`,
        channelId: it.snippet?.channelId ?? '',
        channelName: it.snippet?.channelTitle ?? '',
        publishedAt: it.snippet?.publishedAt ?? '',
        viewCount: Number(it.statistics?.viewCount ?? 0),
        likeCount: it.statistics?.likeCount != null ? Number(it.statistics.likeCount) : null,
        commentCount:
          it.statistics?.commentCount != null ? Number(it.statistics.commentCount) : null,
        durationSeconds: dur,
        isShorts,
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
