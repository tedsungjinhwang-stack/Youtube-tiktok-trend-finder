/**
 * YouTube Data API v3 — 연결된 채널의 예약(scheduled) 영상 가져오기.
 *
 * 흐름:
 *   1. channels.list?mine=true → OAuth 로그인 채널의 uploads playlist id
 *   2. playlistItems.list → 최근 영상 id 들
 *   3. videos.list?id=...&part=snippet,status → privacyStatus=='private' && publishAt 있으면 예약
 */

import { prisma } from '@/lib/db';
import { refresh as refreshGoogleToken } from './oauth';

const API = 'https://www.googleapis.com/youtube/v3';

type YtChannel = {
  id: string;
  snippet: { title: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
};
type YtPlaylistItem = {
  contentDetails: { videoId: string; videoPublishedAt?: string };
};
type YtVideo = {
  id: string;
  snippet: { title: string; description?: string; channelId: string };
  status: { privacyStatus: 'public' | 'private' | 'unlisted'; publishAt?: string };
};

async function call<T>(token: string, path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`YouTube API (${r.status}): ${await r.text()}`);
  return r.json() as Promise<T>;
}

/** 채널별 토큰을 살아있게 유지 (만료 임박이면 refresh + DB 저장) */
async function validToken(rowId: string): Promise<string | null> {
  const row = await prisma.channelYouTubeOAuth.findUnique({ where: { id: rowId } });
  if (!row) return null;
  if (row.expiresAt.getTime() > Date.now() + 60_000) return row.accessToken;
  try {
    const t = await refreshGoogleToken(row.refreshToken);
    await prisma.channelYouTubeOAuth.update({
      where: { id: rowId },
      data: {
        accessToken: t.access_token,
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
      },
    });
    return t.access_token;
  } catch {
    return null;
  }
}

/** OAuth 직후 호출: 로그인 컨텍스트의 YouTube 채널 id/name 가져오기 */
export async function fetchChannelInfo(accessToken: string): Promise<{
  channelId: string;
  channelName: string;
} | null> {
  const j = await call<{ items?: YtChannel[] }>(
    accessToken,
    `/channels?part=snippet,contentDetails&mine=true`
  );
  const c = j.items?.[0];
  if (!c) return null;
  return { channelId: c.id, channelName: c.snippet.title };
}

/**
 * 한 채널의 예약 영상 가져와서 ScheduledVideo upsert.
 * @returns 가져온 영상 개수 (신규 + 업데이트)
 */
export async function syncChannelScheduled(rowId: string): Promise<number> {
  const row = await prisma.channelYouTubeOAuth.findUnique({
    where: { id: rowId },
    include: { myChannel: true },
  });
  if (!row) throw new Error('YouTube 연결 없음');

  const token = await validToken(rowId);
  if (!token) throw new Error('토큰 만료/갱신 실패');

  // 1) 본인 채널 + uploads 플레이리스트
  const chJson = await call<{ items?: YtChannel[] }>(
    token,
    '/channels?part=snippet,contentDetails&mine=true'
  );
  const ch = chJson.items?.[0];
  if (!ch) throw new Error('채널 조회 실패');
  const uploads = ch.contentDetails.relatedPlaylists.uploads;

  // 2) 최근 50개 영상 id 수집
  const plJson = await call<{ items?: YtPlaylistItem[] }>(
    token,
    `/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50`
  );
  const ids = (plJson.items ?? [])
    .map((x) => x.contentDetails.videoId)
    .filter(Boolean);
  if (ids.length === 0) {
    await prisma.channelYouTubeOAuth.update({
      where: { id: rowId },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    });
    return 0;
  }

  // 3) videos.list 로 status 가져오기 (50개씩)
  const vJson = await call<{ items?: YtVideo[] }>(
    token,
    `/videos?part=snippet,status&id=${ids.join(',')}`
  );
  const items = vJson.items ?? [];

  // 4) privacyStatus=='private' AND publishAt 있는 것만 (= 예약 영상)
  const scheduled = items.filter(
    (v) => v.status.privacyStatus === 'private' && v.status.publishAt
  );

  let count = 0;
  for (const v of scheduled) {
    await prisma.scheduledVideo.upsert({
      where: {
        channelId_youtubeVideoId: {
          channelId: row.myChannelId,
          youtubeVideoId: v.id,
        },
      },
      create: {
        channelId: row.myChannelId,
        title: v.snippet.title,
        scheduledAt: new Date(v.status.publishAt!),
        notes: `https://youtu.be/${v.id}`,
        youtubeVideoId: v.id,
        status: 'planned',
      },
      update: {
        title: v.snippet.title,
        scheduledAt: new Date(v.status.publishAt!),
        notes: `https://youtu.be/${v.id}`,
      },
    });
    count++;
  }

  await prisma.channelYouTubeOAuth.update({
    where: { id: rowId },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });

  return count;
}
