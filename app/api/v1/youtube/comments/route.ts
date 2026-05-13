import { NextRequest, NextResponse } from 'next/server';
import { getActiveKey, markUsed, markExhausted, markDisabled } from '@/lib/youtube/keyManager';

export const dynamic = 'force-dynamic';

const API = 'https://www.googleapis.com/youtube/v3/commentThreads';

/** Extract videoId from various YouTube URL formats or accept raw id. */
function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:shorts|embed)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export async function GET(req: NextRequest) {
  const raw =
    req.nextUrl.searchParams.get('url') ??
    req.nextUrl.searchParams.get('videoId') ??
    '';
  const videoId = parseVideoId(raw);
  if (!videoId) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_URL', message: 'YouTube URL 또는 11자리 videoId 가 필요합니다' } },
      { status: 400 }
    );
  }
  const maxResults = Math.min(
    100,
    Math.max(1, Number(req.nextUrl.searchParams.get('maxResults') ?? 20))
  );
  const order = (req.nextUrl.searchParams.get('order') ?? 'relevance').toLowerCase();
  const validOrder = order === 'time' ? 'time' : 'relevance';

  const triedKeyIds = new Set<string>();
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = await getActiveKey();
    if (!key) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_KEY', message: 'YouTube API 키 없음 — /settings/api-keys 등록' } },
        { status: 503 }
      );
    }
    if (triedKeyIds.has(key.id)) {
      return NextResponse.json(
        { success: false, error: { code: 'ALL_KEYS_FAILED', message: '모든 키 시도 실패' } },
        { status: 503 }
      );
    }
    triedKeyIds.add(key.id);

    const params = new URLSearchParams({
      part: 'snippet',
      videoId,
      maxResults: String(maxResults),
      order: validOrder,
      key: key.apiKey,
    });
    const resp = await fetch(`${API}?${params}`);
    if (resp.ok) {
      const json = (await resp.json()) as YtCommentThreadsResponse;
      await markUsed(key.id, 1);
      const items = (json.items ?? []).map((it) => {
        const tl = it.snippet?.topLevelComment?.snippet;
        return {
          authorName: tl?.authorDisplayName ?? '',
          authorAvatarUrl: tl?.authorProfileImageUrl ?? '',
          authorChannelUrl: tl?.authorChannelUrl ?? '',
          textOriginal: tl?.textOriginal ?? tl?.textDisplay ?? '',
          likeCount: Number(tl?.likeCount ?? 0),
          publishedAt: tl?.publishedAt ?? '',
        };
      });
      return NextResponse.json({
        success: true,
        data: items,
        meta: { total: items.length, videoId, order: validOrder },
      });
    }

    const body = await resp.text().catch(() => '');
    if (resp.status === 403 && /quota/i.test(body)) {
      await markExhausted(key.id, body.slice(0, 200));
      continue;
    }
    if (resp.status === 400 && /API key (expired|not valid)|API_KEY_INVALID/i.test(body)) {
      await markDisabled(key.id, body.slice(0, 200));
      continue;
    }
    if (resp.status === 403 && /commentsDisabled|disabled comments/i.test(body)) {
      return NextResponse.json(
        { success: false, error: { code: 'COMMENTS_DISABLED', message: '이 영상은 댓글이 비활성화돼 있습니다' } },
        { status: 403 }
      );
    }
    if (resp.status === 404 || (resp.status === 400 && /videoNotFound/i.test(body))) {
      return NextResponse.json(
        { success: false, error: { code: 'VIDEO_NOT_FOUND', message: '영상을 찾을 수 없습니다' } },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'YT_ERROR', message: `${resp.status}: ${body.slice(0, 200)}` } },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { success: false, error: { code: 'ALL_KEYS_FAILED', message: '모든 키 시도 실패' } },
    { status: 503 }
  );
}

type YtCommentThreadsResponse = {
  items?: Array<{
    snippet?: {
      topLevelComment?: {
        snippet?: {
          authorDisplayName?: string;
          authorProfileImageUrl?: string;
          authorChannelUrl?: string;
          textDisplay?: string;
          textOriginal?: string;
          likeCount?: number;
          publishedAt?: string;
        };
      };
    };
  }>;
};
