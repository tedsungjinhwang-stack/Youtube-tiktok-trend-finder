/**
 * TikTok 트렌딩 (KR) — apidojo/tiktok-scraper actor 사용.
 * 비용: $0.30 / 1k posts.
 */

import { ApifyClient } from 'apify-client';
import { getCred } from '@/lib/credentials';

const KR_TRENDING_KEYWORDS = ['fyp', 'kpop', 'korea', 'trending', 'viral'];

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

type AnyRec = Record<string, unknown>;

function pick<T = unknown>(obj: AnyRec, paths: string[]): T | undefined {
  for (const p of paths) {
    const parts = p.split('.');
    let cur: unknown = obj;
    for (const k of parts) {
      if (cur && typeof cur === 'object' && k in (cur as AnyRec)) {
        cur = (cur as AnyRec)[k];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null && cur !== '') return cur as T;
  }
  return undefined;
}

export async function fetchTiktokTrending(
  region: string = 'KR',
  maxItems = 200
): Promise<TiktokTrendingVideo[]> {
  const token = await getCred('APIFY_API_TOKEN');
  if (!token) throw new Error('APIFY_API_TOKEN 미설정 — /settings/api-keys 에서 등록');
  const client = new ApifyClient({ token });

  const run = await client.actor('apidojo/tiktok-scraper').call({
    keywords: KR_TRENDING_KEYWORDS,
    location: region,
    maxItems,
    sortType: 'MOST_LIKED',
    dateRange: 'THIS_WEEK',
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  if (items.length === 0) {
    throw new Error(
      `Apify actor 결과 0개 (run ${run.id}). actor 실행은 됐지만 dataset 비어있음 — keywords/location 조정 필요할 수 있음`
    );
  }

  const seen = new Set<string>();
  const out: TiktokTrendingVideo[] = [];
  let mapped = 0;
  for (const raw of items) {
    const i = raw as AnyRec;
    const videoId =
      pick<string>(i, ['id', 'aweme_id', 'itemId', 'videoId', 'aweme.id']) ??
      (pick<string>(i, ['webVideoUrl', 'videoUrl', 'url'])?.match(/\/(\d+)/)?.[1]) ??
      '';
    if (!videoId || seen.has(String(videoId))) continue;
    seen.add(String(videoId));
    mapped++;

    out.push({
      videoId: String(videoId),
      url:
        pick<string>(i, ['webVideoUrl', 'videoUrl', 'url']) ??
        `https://www.tiktok.com/@/video/${videoId}`,
      title: pick<string>(i, ['text', 'desc', 'description', 'caption']) ?? '',
      channelId:
        pick<string>(i, [
          'authorMeta.id',
          'author.id',
          'authorMeta.uniqueId',
          'author.uniqueId',
        ]) ?? '',
      channelName:
        pick<string>(i, [
          'authorMeta.nickName',
          'author.nickname',
          'authorMeta.name',
          'authorMeta.uniqueId',
          'author.uniqueId',
        ]) ?? '',
      thumbnailUrl:
        pick<string>(i, [
          'videoMeta.coverUrl',
          'coverUrl',
          'cover',
          'video.cover',
          'thumbnailUrl',
        ]) ?? null,
      viewCount: Number(pick<number>(i, ['playCount', 'stats.playCount', 'views']) ?? 0),
      likeCount: (() => {
        const v = pick<number>(i, ['diggCount', 'stats.diggCount', 'likes']);
        return v != null ? Number(v) : null;
      })(),
      commentCount: (() => {
        const v = pick<number>(i, ['commentCount', 'stats.commentCount', 'comments']);
        return v != null ? Number(v) : null;
      })(),
      durationSeconds: Number(
        pick<number>(i, ['videoMeta.duration', 'duration', 'video.duration']) ?? 0
      ),
      publishedAt: (() => {
        const iso = pick<string>(i, ['createTimeISO', 'createDate', 'publishedAt']);
        if (iso) return iso;
        const ts = pick<number>(i, ['createTime', 'create_time']);
        if (ts) return new Date(Number(ts) * 1000).toISOString();
        return new Date().toISOString();
      })(),
      isShorts: true,
    });
  }

  if (mapped === 0) {
    // 진단용 — 첫 아이템의 키들 보여줌
    const firstKeys = Object.keys(items[0] as AnyRec).slice(0, 20).join(', ');
    throw new Error(
      `Apify 응답 ${items.length}개 있는데 videoId 추출 실패. 첫 아이템 키: ${firstKeys}`
    );
  }

  out.sort((a, b) => b.viewCount - a.viewCount);
  return out;
}
