/**
 * YouTube 해시태그/키워드 검색 — search.list + videos.list 조합.
 *
 * 비용:
 *   search.list = 100 quota (검색 호출)
 *   videos.list = 1 quota (배치 50개)
 *   총: 검색 1회당 ~101 quota
 *   → 30,000/일 quota로 약 290회/일 가능
 */

import { getActiveKey, markUsed, markExhausted } from './keyManager';
import { parseIsoDurationSeconds } from './trending';
import type { ScrapedVideo } from '@/lib/scraper/apify';

const API = 'https://www.googleapis.com/youtube/v3';

export type YoutubeSearchOrder = 'viewCount' | 'date' | 'relevance';

export type YoutubeSearchResult = {
  videos: ScrapedVideo[];
  channels: Map<string, { id: string; title: string; handle: string | null }>;
};

export async function searchYoutubeByHashtag(
  hashtag: string,
  options: {
    order?: YoutubeSearchOrder;
    maxResults?: number;
    /** 이 시각 이후에 게시된 영상만 (YouTube API 측 필터, RFC3339 ISO) */
    publishedAfter?: Date;
    /** 이 시각 이전에 게시된 영상만 (오래된 영상 검색 시) */
    publishedBefore?: Date;
  } = {}
): Promise<YoutubeSearchResult> {
  const tag = hashtag.replace(/^#+/, '');
  const order = options.order ?? 'viewCount';
  // search.list는 한 페이지에 max 50개 — 50개 단위로 페이지네이션
  const totalRequested = Math.min(options.maxResults ?? 50, 200);

  // 1. search.list 페이지네이션 — 50개씩 가져오기
  const videoIds: string[] = [];
  let pageToken: string | undefined = undefined;

  while (videoIds.length < totalRequested) {
    const remaining = totalRequested - videoIds.length;
    const pageSize = Math.min(remaining, 50);

    const params: Record<string, string> = {
      part: 'snippet',
      q: `#${tag}`,
      type: 'video',
      order,
      maxResults: String(pageSize),
    };
    if (pageToken) params.pageToken = pageToken;
    if (options.publishedAfter) {
      params.publishedAfter = options.publishedAfter.toISOString();
    }
    if (options.publishedBefore) {
      params.publishedBefore = options.publishedBefore.toISOString();
    }

    const searchJson = await ytFetch('/search', params);
    const items: any[] = searchJson.items ?? [];
    for (const it of items) {
      const id = it.id?.videoId;
      if (typeof id === 'string') videoIds.push(id);
    }

    pageToken = searchJson.nextPageToken;
    if (!pageToken || items.length === 0) break;
  }

  if (videoIds.length === 0) {
    return { videos: [], channels: new Map() };
  }

  // 2. videos.list — 50개씩 묶어서 통계 조회
  const items: any[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const videosJson = await ytFetch('/videos', {
      part: 'snippet,statistics,contentDetails',
      id: batch.join(','),
    });
    if (videosJson.items) items.push(...videosJson.items);
  }
  const videosJson = { items };

  const channels = new Map<string, { id: string; title: string; handle: string | null }>();
  const videos: ScrapedVideo[] = (videosJson.items ?? []).map((it: any) => {
    const dur = parseIsoDurationSeconds(it.contentDetails?.duration ?? '');
    const channelId = it.snippet?.channelId ?? '';
    const channelTitle = it.snippet?.channelTitle ?? '';
    if (channelId && !channels.has(channelId)) {
      channels.set(channelId, {
        id: channelId,
        title: channelTitle,
        handle: null,
      });
    }
    return {
      externalId: it.id,
      url: `https://www.youtube.com/watch?v=${it.id}`,
      caption: it.snippet?.title ?? null,
      thumbnailUrl:
        it.snippet?.thumbnails?.medium?.url ??
        it.snippet?.thumbnails?.default?.url ??
        null,
      viewCount: BigInt(it.statistics?.viewCount ?? 0),
      likeCount:
        it.statistics?.likeCount != null
          ? Number(it.statistics.likeCount)
          : null,
      commentCount:
        it.statistics?.commentCount != null
          ? Number(it.statistics.commentCount)
          : null,
      durationSeconds: dur,
      isShorts: dur > 0 && dur <= 60,
      publishedAt: new Date(it.snippet?.publishedAt ?? Date.now()),
      authorHandle: null,
      authorChannelId: channelId || null,
      authorDisplayName: channelTitle || null,
    };
  });

  return { videos, channels };
}

/** 키 로테이션 자동 fetch — quota 비용은 호출자가 직접 markUsed */
async function ytFetch(
  path: string,
  params: Record<string, string>
): Promise<any> {
  const isSearch = path === '/search';
  const cost = isSearch ? 100 : 1;
  const maxAttempts = 5;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = await getActiveKey();
    if (!key) {
      throw new Error('YouTube API 키가 없거나 모두 소진됨');
    }

    const qs = new URLSearchParams({ ...params, key: key.apiKey });
    const resp = await fetch(`${API}${path}?${qs}`);

    if (resp.ok) {
      await markUsed(key.id, cost);
      return resp.json();
    }

    const body = await resp.text().catch(() => '');
    if (resp.status === 403 && /quota/i.test(body)) {
      await markExhausted(key.id, body.slice(0, 200));
      lastErr = new Error('quota_exhausted');
      continue;
    }

    // INVALID/EXPIRED 키 — 다음 키로 회전
    if (resp.status === 400 && /API_KEY_INVALID|expired|invalid/i.test(body)) {
      await markExhausted(key.id, body.slice(0, 200));
      lastErr = new Error('key_invalid');
      continue;
    }

    if (resp.status === 400 || resp.status === 404) {
      throw new Error(`youtube ${resp.status}: ${body.slice(0, 300)}`);
    }

    lastErr = new Error(`youtube ${resp.status}: ${body.slice(0, 200)}`);
  }

  throw lastErr ?? new Error('youtube fetch 실패');
}
