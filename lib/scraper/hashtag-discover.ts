/**
 * 해시태그 기반 영상 발견 (Apify TT/IG).
 *
 * 흐름:
 *  1. Apify로 #hashtag 검색 (인기/Top 위주)
 *  2. 각 영상의 작성자 채널을 자동 생성 (isActive=false → cron 자동 스크래핑 대상 아님)
 *  3. Video 저장 (sourceHashtag로 출처 기록, 48시간 + 신규만 정책 동일)
 *
 * 비용: 한 해시태그당 30개 fetch ≈ TT $0.05, IG $0.045
 */

import type { Folder } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  scrapeApifyTiktokByHashtag,
  scrapeApifyInstagramByHashtag,
  scrapeApifyXiaohongshuByHashtag,
  type ScrapedVideo,
} from './apify';
import { searchYoutubeByHashtag } from '@/lib/youtube/hashtag-search';
import { inferFormat } from '@/lib/format';

// 인기피드 해시태그 모드는 hashtag/search 가능한 플랫폼만 (Douyin 제외)
export type HashtagPlatform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'XIAOHONGSHU';

export type DiscoverResult = {
  hashtag: string;
  platform: HashtagPlatform;
  fetched: number;
  saved: number;
  skipped: number;
};

const HASHTAG_FOLDER_NAME = '__hashtag_discovery__';
/** 해시태그 발견 영상은 이 조회수 이상만 DB에 저장 (저품질 노이즈 제거) */
const MIN_VIEWS_TO_SAVE = 100_000;

export type DiscoverPeriod =
  | '24h'
  | '48h'
  | '7d'
  | '30d'
  /** 6개월 이상 된 오래된 영상 (publishedBefore 기준) */
  | 'older_6m'
  | 'all';

export async function discoverByHashtag(
  hashtag: string,
  platform: HashtagPlatform,
  resultsLimit = 100,
  period: DiscoverPeriod = 'all'
): Promise<DiscoverResult> {
  const tag = hashtag.replace(/^#+/, '').toLowerCase();
  if (!tag) throw new Error('빈 해시태그');

  // 1. 플랫폼별 검색
  let result: { videos: ScrapedVideo[] };
  if (platform === 'TIKTOK') {
    result = await scrapeApifyTiktokByHashtag([tag], resultsLimit);
  } else if (platform === 'INSTAGRAM') {
    result = await scrapeApifyInstagramByHashtag(tag, resultsLimit);
  } else if (platform === 'XIAOHONGSHU') {
    result = await scrapeApifyXiaohongshuByHashtag(tag, resultsLimit);
  } else {
    // YouTube — Data API로 검색. period 적용 시 publishedAfter / publishedBefore 사용
    const publishedAfter = periodToSinceDate(period);
    const publishedBefore = periodToBeforeDate(period);
    const yt = await searchYoutubeByHashtag(tag, {
      order: 'viewCount',
      maxResults: resultsLimit,
      ...(publishedAfter ? { publishedAfter } : {}),
      ...(publishedBefore ? { publishedBefore } : {}),
    });
    result = { videos: yt.videos };
  }

  // 2. 발견 채널 자동 생성용 폴더 확보
  const folder = await ensureDiscoveryFolder();

  // 3. 조회수 10만 이상만 (시간 제한 없음 — TT/IG 인기순 그대로 받음)
  const recent = result.videos.filter(
    (v) => Number(v.viewCount) >= MIN_VIEWS_TO_SAVE
  );
  if (recent.length === 0) {
    return { hashtag: tag, platform, fetched: result.videos.length, saved: 0, skipped: 0 };
  }

  // 4. 이미 DB에 있는 영상 제외
  const externalIds = recent.map((v) => v.externalId);
  const existing = await prisma.video.findMany({
    where: { platform, externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalId));
  const fresh = recent.filter((v) => !existingSet.has(v.externalId));

  if (fresh.length === 0) {
    return {
      hashtag: tag,
      platform,
      fetched: result.videos.length,
      saved: 0,
      skipped: existing.length,
    };
  }

  // 5. 작성자 채널 ensure
  //    YouTube: authorChannelId(UC...) 우선, displayName도 같이 저장
  //    TT/IG: handle 우선, URL에서 폴백
  let saved = 0;
  for (const v of fresh) {
    const authorHandle = extractAuthorHandle(v, platform);
    const channelExternalId =
      platform === 'YOUTUBE' || platform === 'XIAOHONGSHU'
        ? v.authorChannelId ?? authorHandle ?? `unknown_${v.externalId.slice(0, 12)}`
        : authorHandle ?? `unknown_${v.externalId.slice(0, 12)}`;

    const channel = await prisma.channel.upsert({
      where: {
        platform_externalId: { platform, externalId: channelExternalId },
      },
      create: {
        platform,
        externalId: channelExternalId,
        handle: authorHandle,
        displayName: v.authorDisplayName ?? null,
        folderId: folder.id,
        isActive: false, // 자동 cron 제외
      },
      update: {
        // 표시명 업데이트 (이전에 비어있던 경우 채움)
        ...(v.authorDisplayName ? { displayName: v.authorDisplayName } : {}),
      },
    });

    try {
      await prisma.video.create({
        data: {
          channelId: channel.id,
          platform,
          externalId: v.externalId,
          url: v.url,
          caption: v.caption ?? null,
          thumbnailUrl: v.thumbnailUrl ?? null,
          viewCount: v.viewCount,
          likeCount: v.likeCount ?? null,
          commentCount: v.commentCount ?? null,
          shareCount: v.shareCount ?? null,
          durationSeconds: v.durationSeconds ?? null,
          isShorts: v.isShorts ?? null,
          publishedAt: v.publishedAt,
          format: inferFormat({
            caption: v.caption ?? null,
            durationSeconds: v.durationSeconds,
            isShorts: v.isShorts,
          }),
          formatLockedBy: 'auto',
          sourceHashtag: tag,
        },
      });
      saved++;
    } catch {
      /* race / unique violation */
    }
  }

  return {
    hashtag: tag,
    platform,
    fetched: result.videos.length,
    saved,
    skipped: existing.length,
  };
}

/** 발견된 작성자 채널을 묶을 hidden 폴더. UI 폴더 탭에는 노출되지 않게 isSeeded=false 유지하고 이름으로만 구분. */
async function ensureDiscoveryFolder(): Promise<Folder> {
  const existing = await prisma.folder.findUnique({
    where: { name: HASHTAG_FOLDER_NAME },
  });
  if (existing) return existing;
  const last = await prisma.folder.findFirst({ orderBy: { sortOrder: 'desc' } });
  return prisma.folder.create({
    data: {
      name: HASHTAG_FOLDER_NAME,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      isSeeded: false,
    },
  });
}

const DAY = 24 * 60 * 60 * 1000;

/** publishedAfter — 이 시각 이후 게시 영상만 (최근 X) */
function periodToSinceDate(period: DiscoverPeriod): Date | null {
  const map: Partial<Record<DiscoverPeriod, number>> = {
    '24h': 1,
    '48h': 2,
    '7d': 7,
    '30d': 30,
  };
  const days = map[period];
  return days != null ? new Date(Date.now() - days * DAY) : null;
}

/** publishedBefore — 이 시각 이전 게시 영상만 (오래된 X) */
function periodToBeforeDate(period: DiscoverPeriod): Date | null {
  if (period === 'older_6m') {
    return new Date(Date.now() - 180 * DAY);
  }
  return null;
}

function extractAuthorHandle(
  v: ScrapedVideo,
  platform: HashtagPlatform
): string | null {
  // 1차: 매퍼가 채워준 authorHandle
  if (v.authorHandle) return v.authorHandle;
  // 2차: URL에서 추출 (TT만 가능)
  if (platform === 'TIKTOK' && v.url) {
    const m = v.url.match(/tiktok\.com\/@([^/?]+)/i);
    return m ? '@' + m[1].toLowerCase() : null;
  }
  if (platform === 'YOUTUBE' && v.url) {
    // YouTube 영상 URL은 watch?v=... 형태 — 채널 핸들 직접 추출 불가.
    // 채널은 unknown_VIDEOID로 임시 ID 사용 (ensure 시점에 처리됨)
    return null;
  }
  return null;
}
