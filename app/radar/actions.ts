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
import {
  assignVideoWork,
  blockAlias,
  confirmGuess,
  matchAdmin,
  searchWorks,
  unblockAlias,
  unmatchVideo,
  workAliases,
  type MatchAdmin,
  type WorkPick,
} from '@/lib/radar/fix';
import {
  acceptAllSuggested,
  acceptCandidate,
  addCandidatesByLinks,
  listCandidates,
  rejectCandidate,
  restoreCandidate,
  rookiesInPacks,
  type CandidateList,
  type RookieRow,
} from '@/lib/radar/discover';
import {
  AWARD_CALENDAR,
  getAwards,
  getEntries,
  getGolden,
  getPersons,
  getSameSeasonPast,
  getSchedule,
  getSeason,
  getSpeed,
  getTones,
} from '@/lib/radar/tabs';

/* ── 신규 발굴 ── */
export async function candidatesAction(status: 'new' | 'added' | 'rejected'): Promise<CandidateList> {
  return listCandidates(status);
}
export async function acceptCandidateAction(id: string, target: { folderId?: string; newFolder?: string }) {
  const r = await acceptCandidate(id, target);
  revalidatePath('/radar');
  return r;
}
export async function rejectCandidateAction(id: string): Promise<void> {
  await rejectCandidate(id);
}
export async function restoreCandidateAction(id: string): Promise<void> {
  await restoreCandidate(id);
}
export async function acceptAllSuggestedAction(minScore: number): Promise<number> {
  const n = await acceptAllSuggested(minScore);
  revalidatePath('/radar');
  return n;
}
export async function addCandidatesAction(text: string) {
  return addCandidatesByLinks(text);
}
export async function rookiesInPacksAction(): Promise<RookieRow[]> {
  return rookiesInPacks();
}

/* ── 작품 인식 고치기 ── */
export async function searchWorksAction(q: string): Promise<WorkPick[]> {
  return searchWorks(q);
}
export async function assignVideoWorkAction(videoId: string, pick: WorkPick, remember?: string): Promise<void> {
  await assignVideoWork(videoId, pick, remember);
}
export async function unmatchVideoAction(videoId: string): Promise<void> {
  await unmatchVideo(videoId);
}
export async function confirmGuessAction(videoId: string): Promise<void> {
  await confirmGuess(videoId);
}
export async function blockAliasAction(text: string): Promise<number> {
  return blockAlias(text);
}
export async function unblockAliasAction(text: string): Promise<void> {
  await unblockAlias(text);
}
export async function workAliasesAction(workId: string): Promise<{ text: string; count: number }[]> {
  return workAliases(workId);
}
export async function matchAdminAction(): Promise<MatchAdmin> {
  return matchAdmin();
}

export async function radarDataAction(period: WorksPeriod): Promise<RadarData> {
  return getRadarData(period);
}

export async function entriesAction() {
  return getEntries();
}
export async function personsAction() {
  return getPersons();
}
export async function tonesAction() {
  return getTones();
}
export async function scheduleAction() {
  return getSchedule();
}
export async function seasonAction() {
  return getSeason();
}
export async function goldenAction() {
  return getGolden();
}
export async function speedAction() {
  return getSpeed();
}
export async function awardsAction() {
  return { ...(await getAwards()), calendar: AWARD_CALENDAR };
}
/** 홈 — 지금 터지는 쇼츠·뜨는 작품·오늘 편성·작년 이맘때 터진 영상 */
export async function homeAction() {
  const [hot, works, schedule, past] = await Promise.all([
    getHotVideos({ format: 'shorts', window: 3, sort: 'rising', excludeWhale: false }),
    getRadarData('3d'),
    // 편성표는 수집기가 미리 받아 두지만, 비어 있으면 홈이 오래 기다리지 않게 5초까지만
    Promise.race([getSchedule().catch(() => []), new Promise<Awaited<ReturnType<typeof getSchedule>>>((r) => setTimeout(() => r([]), 5000))]),
    getSameSeasonPast(12),
  ]);
  return { hot: hot.items.slice(0, 10), status: hot.status, works, schedule: schedule.slice(0, 2), past };
}

/** 채널팩 이름으로 관심 목록에 넣기 (팬튜브·코미디 등 묶음 화면에서) */
export async function watchFoldersByNameAction(names: string[]): Promise<{ ok: boolean; count: number }> {
  const r = await prisma.folder.updateMany({ where: { name: { in: names } }, data: { watched: true } });
  revalidatePath('/radar');
  return { ok: true, count: r.count };
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
