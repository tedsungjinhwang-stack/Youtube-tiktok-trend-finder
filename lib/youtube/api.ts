/**
 * YouTube Data API v3 — 키를 돌려 가며 부른다 (lib/youtube/keyManager).
 *
 * 할당량: channels.list · playlistItems.list · videos.list · channelSections.list 모두 호출 1번에 1 unit.
 *  - channels.list / videos.list 는 한 번에 50개까지 묶을 수 있다.
 *  - search.list 는 한 번에 100 unit (신규 발굴에서만 쓴다).
 */

import { prisma } from '@/lib/db';
import { getActiveKey, markDisabled, markExhausted, markUsed } from '@/lib/youtube/keyManager';

const API = 'https://www.googleapis.com/youtube/v3';

export class QuotaGoneError extends Error {
  constructor() {
    super('YouTube API 키가 없거나 오늘 할당량을 다 썼습니다');
    this.name = 'QuotaGoneError';
  }
}

/** 키 하나가 할당량을 다 쓰면 다음 키로. 모두 소진되면 QuotaGoneError. */
export async function ytFetch<T = any>(path: string, params: Record<string, string>, units = 1): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = await getActiveKey();
    if (!key) throw new QuotaGoneError();

    const qs = new URLSearchParams({ ...params, key: key.apiKey });
    const resp = await fetch(`${API}${path}?${qs}`, { cache: 'no-store' });
    if (resp.ok) {
      await markUsed(key.id, units);
      return (await resp.json()) as T;
    }

    const body = await resp.text().catch(() => '');
    if (resp.status === 403 && /quota/i.test(body)) {
      await markExhausted(key.id, body.slice(0, 200));
      lastErr = new QuotaGoneError();
      continue;
    }
    if (resp.status === 400 && /API_KEY_INVALID|expired|invalid/i.test(body)) {
      await markDisabled(key.id, body.slice(0, 200));
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

/** 오늘 남은 할당량 (활성·미소진 키 합). DB 가 없으면 null */
export async function remainingQuota(): Promise<number | null> {
  try {
    const keys = await prisma.youtubeApiKey.findMany({
      where: { isActive: true, OR: [{ exhaustedAt: null }, { resetAt: { lt: new Date() } }] },
      select: { dailyQuotaLimit: true, usedToday: true },
    });
    return keys.reduce((a, k) => a + Math.max(0, k.dailyQuotaLimit - k.usedToday), 0);
  } catch {
    return null;
  }
}

export function parseIsoDurationSeconds(iso: string): number {
  if (!iso) return 0;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
}

export type YtChannelStat = {
  id: string;
  title: string | null;
  /** @핸들 */
  handle: string | null;
  country: string | null;
  thumbnailUrl: string | null;
  createdAt: Date | null;
  subscriberCount: number | null;
  viewCount: bigint | null;
  videoCount: number | null;
};

/** 채널 통계 — 50개씩 묶어 부른다. 없어진 채널은 결과에서 빠진다 */
export async function fetchChannelStats(ids: string[]): Promise<YtChannelStat[]> {
  const out: YtChannelStat[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const json = await ytFetch<{ items?: any[] }>('/channels', {
      part: 'snippet,statistics',
      id: ids.slice(i, i + 50).join(','),
      maxResults: '50',
    });
    for (const it of json.items ?? []) {
      const st = it.statistics ?? {};
      out.push({
        id: it.id,
        title: it.snippet?.title ?? null,
        handle: it.snippet?.customUrl ?? null,
        country: it.snippet?.country ?? null,
        thumbnailUrl: it.snippet?.thumbnails?.default?.url ?? null,
        createdAt: it.snippet?.publishedAt ? new Date(it.snippet.publishedAt) : null,
        subscriberCount: st.subscriberCount != null && !st.hiddenSubscriberCount ? Number(st.subscriberCount) : null,
        viewCount: st.viewCount != null ? BigInt(st.viewCount) : null,
        videoCount: st.videoCount != null ? Number(st.videoCount) : null,
      });
    }
  }
  return out;
}

/** 최근 영상 검색 (100 unit) — 신규 발굴. 조회수 순, 한국·한국어 */
export async function searchRecentVideos(
  q: string,
  opts: { since: Date; short?: boolean; max?: number }
): Promise<{ videoId: string; channelId: string; publishedAt: Date; title: string }[]> {
  const json = await ytFetch<{ items?: any[] }>(
    '/search',
    {
      part: 'snippet',
      type: 'video',
      order: 'viewCount',
      regionCode: 'KR',
      relevanceLanguage: 'ko',
      publishedAfter: opts.since.toISOString(),
      maxResults: String(opts.max ?? 50),
      ...(q ? { q } : {}),
      ...(opts.short ? { videoDuration: 'short' } : {}),
    },
    100
  );
  return (json.items ?? [])
    .filter((it) => it.id?.videoId && it.snippet?.channelId)
    .map((it) => ({
      videoId: it.id.videoId,
      channelId: it.snippet.channelId,
      publishedAt: new Date(it.snippet.publishedAt ?? Date.now()),
      title: it.snippet.title ?? '',
    }));
}

/** 한국 인기 급상승 영상의 채널 (쪽마다 1 unit, 최대 200개) */
export async function mostPopularChannels(pages = 4): Promise<{ channelId: string; publishedAt: Date }[]> {
  const out: { channelId: string; publishedAt: Date }[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < pages; i++) {
    const json = await ytFetch<{ items?: any[]; nextPageToken?: string }>('/videos', {
      part: 'snippet',
      chart: 'mostPopular',
      regionCode: 'KR',
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of json.items ?? []) {
      if (it.snippet?.channelId) out.push({ channelId: it.snippet.channelId, publishedAt: new Date(it.snippet.publishedAt ?? Date.now()) });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/** 채널 페이지의 「추천 채널」 칸에 걸린 채널들 (1 unit) */
export async function featuredChannels(channelId: string): Promise<string[]> {
  try {
    const json = await ytFetch<{ items?: any[] }>('/channelSections', { part: 'contentDetails', channelId });
    return [...new Set((json.items ?? []).flatMap((s) => (s.contentDetails?.channels as string[] | undefined) ?? []))].filter((c) => c.startsWith('UC'));
  } catch (e) {
    if (e instanceof QuotaGoneError) throw e;
    return [];
  }
}

/** 채널 링크·@핸들·UC ID → UC ID (@핸들은 1 unit) */
export async function resolveChannelRef(ref: string): Promise<string | null> {
  let s = ref.trim();
  try {
    s = decodeURIComponent(s); // youtube.com/@%EB%A7%8C… 꼴 한글 핸들
  } catch {}
  const uc = s.match(/(UC[\w-]{22})/);
  if (uc) return uc[1];
  const h = s.match(/@([\w.\-가-힣]+)/) ?? s.match(/^([\w.\-가-힣]{3,})$/);
  if (!h) return null;
  const json = await ytFetch<{ items?: any[] }>('/channels', { part: 'id', forHandle: '@' + h[1] });
  return json.items?.[0]?.id ?? null;
}

/** 채널 업로드 목록의 최신 영상 ID (uploads 재생목록 = UU + 채널ID 뒷부분) */
export async function fetchLatestUploadIds(channelId: string, max: number, since?: Date): Promise<string[]> {
  const json = await ytFetch<{ items?: any[] }>('/playlistItems', {
    part: 'contentDetails',
    playlistId: 'UU' + channelId.slice(2),
    maxResults: String(Math.min(max, 50)),
  });
  return (json.items ?? [])
    // since 보다 오래된 영상은 상세를 받지 않는다 (재생목록에 게시 시각이 같이 온다)
    .filter((it) => !since || !it.contentDetails?.videoPublishedAt || new Date(it.contentDetails.videoPublishedAt) >= since)
    .map((it) => it.contentDetails?.videoId)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/**
 * 재생목록 한 쪽 (최대 50개). 채널 자동 재생목록:
 *  UU = 업로드(최신순), UUPS = 인기 쇼츠(조회순), UULP = 인기 영상(롱폼, 조회순), UUSH = 쇼츠(최신순).
 * 해당 영상이 없는 채널은 404 — 빈 목록으로 돌려준다.
 */
export async function fetchPlaylistPage(
  playlistId: string,
  pageToken?: string
): Promise<{ ids: string[]; next: string | null }> {
  try {
    const json = await ytFetch<{ items?: any[]; nextPageToken?: string }>('/playlistItems', {
      part: 'contentDetails',
      playlistId,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    return {
      ids: (json.items ?? [])
        .map((it) => it.contentDetails?.videoId)
        .filter((v): v is string => typeof v === 'string' && v.length > 0),
      next: json.nextPageToken ?? null,
    };
  } catch (e) {
    if (e instanceof Error && /youtube 404/.test(e.message)) return { ids: [], next: null };
    throw e;
  }
}

export type YtVideo = {
  id: string;
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
  durationSec: number;
  isShorts: boolean;
  views: number;
  likes: number | null;
  comments: number | null;
  tags: string[];
  /** 설명란의 해시태그·출처·괄호 안 말 (snippet 을 받았을 때만, 아니면 null) */
  descTags: string[] | null;
  /** 예약 공개·라이브 대기 등 아직 안 올라온 영상 */
  upcoming: boolean;
};

/**
 * 설명란에서 작품 이름이 있을 만한 말만 뽑는다 — 해시태그, '출처: …' 줄, 「」『』<>《》'' 안의 말.
 * 설명란 전체는 크기 때문에 저장하지 않는다.
 */
export function descriptionTags(desc: string): string[] {
  if (!desc) return [];
  const out: string[] = [];
  for (const m of desc.matchAll(/#([^\s#]+)/g)) out.push(m[1]);
  for (const m of desc.matchAll(/[「『〈<《'"“‘]([^」』〉>》'"”’\n]{2,30})[」』〉>》'"”’]/g)) out.push(m[1]);
  // "출처: tvN 닥터X", "영상 출처 - 넷플릭스 스캔들" — 괄호가 없으면 줄 끝까지(30자)
  for (const m of desc.matchAll(/(?:출처|원작|source)\s*[:：\-]\s*([^\n]{2,40})/gi)) {
    const line = m[1].replace(/https?:\/\/\S+/g, '').trim();
    if (line && !/[「『〈<《'"“‘]/.test(line)) out.push(line.slice(0, 30));
  }
  return [...new Set(out.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}

const INT_MAX = 2_147_483_647;

/** 영상 상세 — 50개씩 묶어 부른다. 삭제·비공개 영상은 결과에서 빠진다 */
export async function fetchVideos(ids: string[], withSnippet = true): Promise<YtVideo[]> {
  const out: YtVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const json = await ytFetch<{ items?: any[] }>('/videos', {
      part: withSnippet ? 'snippet,statistics,contentDetails' : 'statistics',
      id: ids.slice(i, i + 50).join(','),
      maxResults: '50',
    });
    for (const it of json.items ?? []) {
      const dur = parseIsoDurationSeconds(it.contentDetails?.duration ?? '');
      const sn = it.snippet ?? {};
      const st = it.statistics ?? {};
      const title: string = sn.title ?? '';
      const hashtags = (title.match(/#[^\s#]+/g) ?? []).map((h: string) => h.slice(1));
      out.push({
        id: it.id,
        channelId: sn.channelId ?? '',
        title,
        thumbnailUrl: sn.thumbnails?.medium?.url ?? sn.thumbnails?.default?.url ?? null,
        publishedAt: new Date(sn.publishedAt ?? Date.now()),
        durationSec: dur,
        // YouTube Shorts: 최대 3분
        isShorts: dur > 0 && dur <= 180,
        views: Math.min(INT_MAX, Number(st.viewCount ?? 0)),
        likes: st.likeCount != null ? Math.min(INT_MAX, Number(st.likeCount)) : null,
        comments: st.commentCount != null ? Math.min(INT_MAX, Number(st.commentCount)) : null,
        tags: [...new Set([...hashtags, ...((sn.tags as string[] | undefined) ?? [])])].slice(0, 30),
        descTags: withSnippet ? descriptionTags(sn.description ?? '') : null,
        upcoming: sn.liveBroadcastContent === 'upcoming',
      });
    }
  }
  return out;
}
