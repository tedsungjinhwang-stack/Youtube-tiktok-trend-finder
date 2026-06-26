/**
 * YouTube Data API v3 — 채널의 최신 업로드 영상 스크래핑.
 *
 * 흐름:
 *  1. resolveChannelId — externalId가 @handle이면 channels.list?forHandle 으로 UCxxx 변환 (+meta).
 *     이후엔 Channel.externalId가 UCxxx로 갱신되어 1단계 스킵.
 *  2. uploads playlist = "UU" + channelId.slice(2). API 호출 없이 계산.
 *  3. playlistItems.list — 최근 영상 50개의 videoId.
 *  4. videos.list?id=batch — 통계/길이 일괄 조회.
 *
 * 쿼터 (units):
 *   channels.list = 1, playlistItems.list = 1, videos.list = 1 per page.
 *   첫 스크래핑(handle 해석 포함): 3 units.
 *   정기 스크래핑(UCxxx 보유): 2 units.
 */

import type { Channel } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getActiveKey, markUsed, markExhausted, markDisabled } from '@/lib/youtube/keyManager';
import { parseIsoDurationSeconds } from '@/lib/youtube/trending';

export type ScrapedVideo = {
  externalId: string;
  url: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  viewCount: bigint;
  likeCount?: number | null;
  commentCount?: number | null;
  durationSeconds?: number | null;
  isShorts?: boolean | null;
  publishedAt: Date;
};

export type ScrapeResult = {
  videos: ScrapedVideo[];
  quotaUsed: number;
};

const API = 'https://www.googleapis.com/youtube/v3';
const MAX_VIDEOS_PER_SCRAPE = 50;

export async function scrapeYoutube(
  channel: Channel,
  opts: { maxVideos?: number } = {}
): Promise<ScrapeResult> {
  let quotaUsed = 0;
  const maxVideos = opts.maxVideos ?? MAX_VIDEOS_PER_SCRAPE;

  // 1. Resolve channelId (UCxxx). 이미 UC로 시작하면 그대로.
  const { channelId, meta, units } = await resolveChannelId(channel);
  quotaUsed += units;

  // 채널 메타가 새로 들어왔으면 DB 갱신 (첫 스크래핑 케이스)
  if (meta) {
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        externalId: channelId,
        ...(meta.title ? { displayName: meta.title } : {}),
        ...(meta.subscriberCount != null
          ? { subscriberCount: meta.subscriberCount }
          : {}),
        ...(meta.totalViewCount != null
          ? { totalViewCount: BigInt(meta.totalViewCount) }
          : {}),
      },
    });
  }

  // 2. uploads playlist = "UU" + channelId.slice(2)
  if (!channelId.startsWith('UC')) {
    throw new Error(`잘못된 channelId 형식: ${channelId}`);
  }
  const uploadsPlaylistId = 'UU' + channelId.slice(2);

  // 3. playlistItems.list → videoIds (페이지네이션, opts.maxVideos 만큼)
  const { videoIds, units: u2 } = await fetchUploadsVideoIds(
    uploadsPlaylistId,
    maxVideos
  );
  quotaUsed += u2;

  if (videoIds.length === 0) {
    return { videos: [], quotaUsed };
  }

  // 4. videos.list → 영상 상세
  const { videos, units: u3 } = await fetchVideosDetail(videoIds);
  quotaUsed += u3;

  return { videos, quotaUsed };
}

/* --------------------------- channelId 해석 ----------------------------- */

type ChannelMeta = {
  title: string | null;
  subscriberCount: number | null;
  totalViewCount: number | null;
};

async function resolveChannelId(
  channel: Channel
): Promise<{ channelId: string; meta: ChannelMeta | null; units: number }> {
  const ext = channel.externalId;

  // 이미 UCxxx면 변환 불필요. 메타도 안 가져옴 (이미 DB에 있을 거고, 매 스크래핑마다 fetch는 낭비).
  if (ext.startsWith('UC')) {
    return { channelId: ext, meta: null, units: 0 };
  }

  // @handle → channels.list?forHandle=...
  const handle = ext.replace(/^@/, '');
  const json = await ytFetch('/channels', {
    part: 'snippet,statistics',
    forHandle: handle,
  });

  const item = json.items?.[0];
  if (!item) {
    throw new Error(`핸들 @${handle} 채널을 찾을 수 없습니다.`);
  }

  return {
    channelId: item.id,
    meta: {
      title: item.snippet?.title ?? null,
      subscriberCount:
        item.statistics?.subscriberCount != null && !item.statistics.hiddenSubscriberCount
          ? Number(item.statistics.subscriberCount)
          : null,
      totalViewCount:
        item.statistics?.viewCount != null
          ? Number(item.statistics.viewCount)
          : null,
    },
    units: 1,
  };
}

/* ------------------------ playlistItems.list ----------------------------- */

/**
 * 페이지네이션으로 최신 → 옛날 순서대로 videoIds 가져옴.
 * playlistItems.list 한 호출당 최대 50개, 1 quota unit.
 * maxResults 까지 또는 페이지 끝까지 (nextPageToken 없음) 반복.
 */
async function fetchUploadsVideoIds(
  playlistId: string,
  maxResults: number
): Promise<{ videoIds: string[]; units: number }> {
  const ids: string[] = [];
  let units = 0;
  let pageToken: string | undefined;
  while (ids.length < maxResults) {
    const params: Record<string, string> = {
      part: 'contentDetails',
      playlistId,
      maxResults: String(Math.min(maxResults - ids.length, 50)),
    };
    if (pageToken) params.pageToken = pageToken;
    const json = await ytFetch('/playlistItems', params);
    units += 1;
    const pageIds = (json.items ?? [])
      .map((it: any) => it.contentDetails?.videoId)
      .filter((v: any): v is string => typeof v === 'string' && v.length > 0);
    ids.push(...pageIds);
    pageToken = json.nextPageToken;
    if (!pageToken || pageIds.length === 0) break;
  }
  return { videoIds: ids.slice(0, maxResults), units };
}

/* ----------------------------- videos.list ------------------------------- */

async function fetchVideosDetail(
  videoIds: string[]
): Promise<{ videos: ScrapedVideo[]; units: number }> {
  // videos.list 는 한 번에 50개까지 — 50개씩 묶어 여러 번 호출.
  const videos: ScrapedVideo[] = [];
  let units = 0;
  for (let i = 0; i < videoIds.length; i += 50) {
    const slice = videoIds.slice(i, i + 50);
    const json = await ytFetch('/videos', {
      part: 'snippet,statistics,contentDetails',
      id: slice.join(','),
    });
    units += 1;
    for (const it of (json.items ?? []) as Array<any>) {
      const dur = parseIsoDurationSeconds(it.contentDetails?.duration ?? '');
      videos.push({
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
        // YouTube Shorts 정의: 최대 3분(180초)
        isShorts: dur > 0 && dur <= 180,
        publishedAt: new Date(it.snippet?.publishedAt ?? Date.now()),
      });
    }
  }
  return { videos, units };
}

/* ---------------------- fetch with key rotation -------------------------- */

/**
 * 키 로테이션 자동: 쿼터 소진 시 다음 키로 재시도. 모두 소진되면 NoActiveKeyError 전파.
 */
async function ytFetch(path: string, params: Record<string, string>): Promise<any> {
  const maxAttempts = 5;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = await getActiveKey();
    if (!key) {
      throw new Error('YouTube API 키가 없거나 모두 소진됨 — /settings/api-keys 확인');
    }

    const qs = new URLSearchParams({ ...params, key: key.apiKey });
    const resp = await fetch(`${API}${path}?${qs}`);

    if (resp.ok) {
      await markUsed(key.id, 1);
      return resp.json();
    }

    const body = await resp.text().catch(() => '');
    if (resp.status === 403 && /quota/i.test(body)) {
      await markExhausted(key.id, body.slice(0, 200));
      lastErr = new Error('quota_exhausted');
      continue; // 다음 키로 재시도
    }

    // INVALID/EXPIRED 키 — 영구 비활성화 후 다음 키로 회전
    if (resp.status === 400 && /API_KEY_INVALID|expired|invalid/i.test(body)) {
      await markDisabled(key.id, body.slice(0, 200));
      lastErr = new Error('key_invalid');
      continue;
    }

    if (resp.status === 400 || resp.status === 404) {
      throw new Error(`youtube ${resp.status}: ${body.slice(0, 300)}`);
    }

    // 5xx 등 일시적 오류 — 재시도
    lastErr = new Error(`youtube ${resp.status}: ${body.slice(0, 200)}`);
  }

  throw lastErr ?? new Error('youtube fetch 실패');
}
