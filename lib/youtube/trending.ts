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
        thumbnailUrl: `https://img.youtube.com/vi/${it.id}/maxresdefault.jpg`,
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

/**
 * 쇼츠 트렌딩: search.list (videoDuration=short, order=viewCount, 최근 업로드) → videos.list 보강.
 *
 * YouTube API 에는 "쇼츠 전용 차트"가 없고 chart=mostPopular 에는 쇼츠가 거의 없어서,
 * search 로 최근 단편(<4분) 인기순 후 videos.list 로 정확한 duration·통계 받아 ≤60s 필터.
 *
 * Quota: search.list 100 + videos.list 1 = ~101 units / 50건.
 */
export async function fetchTrendingShorts(
  region: TrendingRegion = 'KR',
  maxResults = 50,
  withinDays = 7
): Promise<TrendingVideo[]> {
  const key = await getActiveKey();
  if (!key) throw new Error('YouTube API 키 없음 — /settings/api-keys 등록');

  const publishedAfter = new Date(Date.now() - withinDays * 86_400_000).toISOString();
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoDuration: 'short',
    order: 'viewCount',
    regionCode: region,
    relevanceLanguage: regionToLanguage(region),
    publishedAfter,
    maxResults: String(Math.min(50, maxResults)),
    q: '#shorts',
    key: key.apiKey,
  });

  const searchResp = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
  if (!searchResp.ok) {
    const body = await searchResp.text().catch(() => '');
    if (searchResp.status === 403 && /quota/i.test(body)) {
      await markExhausted(key.id, body.slice(0, 200));
      throw new Error('quota_exhausted');
    }
    throw new Error(`youtube search ${searchResp.status}: ${body.slice(0, 200)}`);
  }

  const searchJson = (await searchResp.json()) as YtSearchResponse;
  await markUsed(key.id, 100);

  const ids = (searchJson.items ?? [])
    .map((it) => it.id?.videoId)
    .filter((x): x is string => Boolean(x));
  if (ids.length === 0) return [];

  const detailsParams = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: ids.join(','),
    maxResults: '50',
    key: key.apiKey,
  });
  const detailsResp = await fetch(`${API}?${detailsParams}`);
  if (!detailsResp.ok) {
    const body = await detailsResp.text().catch(() => '');
    throw new Error(`youtube videos ${detailsResp.status}: ${body.slice(0, 200)}`);
  }
  const detailsJson = (await detailsResp.json()) as YtVideosResponse;
  await markUsed(key.id, 1);

  const byId = new Map(detailsJson.items?.map((it) => [it.id, it]) ?? []);
  const passScript = scriptFilter(region);
  const out: TrendingVideo[] = [];
  let rank = 0;
  for (const id of ids) {
    const it = byId.get(id);
    if (!it) continue;
    const dur = parseIsoDurationSeconds(it.contentDetails?.duration ?? '');
    if (dur === 0 || dur > 60) continue;
    const title = it.snippet?.title ?? '';
    const ch = it.snippet?.channelTitle ?? '';
    if (!passScript(title) && !passScript(ch)) continue;
    rank++;
    out.push({
      rank,
      videoId: it.id,
      url: `https://www.youtube.com/shorts/${it.id}`,
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
      isShorts: true,
      region,
    });
  }
  out.sort((a, b) => b.viewCount - a.viewCount);
  out.forEach((v, i) => (v.rank = i + 1));
  return out;
}

/** 제목·채널명에 해당 국가 문자가 없으면 제거. KR/JP 처럼 고유 스크립트가 있는 경우만 적용. */
function scriptFilter(region: TrendingRegion): (text: string) => boolean {
  switch (region) {
    case 'KR':
      return (t) => /[가-힯]/.test(t);
    case 'JP':
      return (t) => /[぀-ゟ゠-ヿ一-鿿]/.test(t);
    default:
      return () => true;
  }
}

/** YouTube regionCode → relevanceLanguage 매핑. search.list 의 region 정확도 보완용. */
function regionToLanguage(region: TrendingRegion): string {
  switch (region) {
    case 'KR':
      return 'ko';
    case 'JP':
      return 'ja';
    case 'DE':
      return 'de';
    case 'FR':
      return 'fr';
    case 'IN':
      return 'hi';
    case 'BR':
      return 'pt';
    case 'US':
    case 'GB':
    default:
      return 'en';
  }
}

export function parseIsoDurationSeconds(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

type YtSearchResponse = {
  items?: Array<{ id?: { videoId?: string } }>;
};

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
