'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import {
  getHotVideos,
  getPastHits,
  getRanking,
  getWatchlist,
  type HotQuery,
  type HotResult,
  type PastQuery,
  type PastResult,
  type RankingQuery,
  type RankingResult,
  type WatchlistResult,
} from '@/lib/radar/queries';
import type { RadarData } from '@/lib/radar/types';
import { getRadarData, type WorksPeriod } from '@/lib/radar/works';

export async function radarDataAction(period: WorksPeriod): Promise<RadarData> {
  return getRadarData(period);
}

export async function rankingAction(q: RankingQuery): Promise<RankingResult> {
  return getRanking(q);
}

export async function hotVideosAction(q: HotQuery): Promise<HotResult> {
  return getHotVideos(q);
}

export async function pastHitsAction(q: PastQuery): Promise<PastResult> {
  return getPastHits(q);
}

export async function watchlistAction(): Promise<WatchlistResult> {
  return getWatchlist();
}

/** 관심 목록에 넣기/빼기 — 넣은 폴더의 채널은 다음 수집부터 영상까지 추적한다 */
export async function setFolderWatchedAction(folderId: string, watched: boolean): Promise<{ ok: boolean }> {
  try {
    await prisma.folder.update({ where: { id: folderId }, data: { watched } });
    revalidatePath('/radar');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
