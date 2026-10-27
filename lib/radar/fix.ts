/**
 * 작품 인식 직접 고치기 — 화면의 「이 작품 아님」·「다른 작품으로」·「이 말은 작품 아님」.
 * 영상 하나만 고치면 그 영상은 다시 찾지 않고(matchLocked), 말(별칭)을 막거나 정하면 그 말이 걸린 영상 전체에 적용된다.
 */

import { prisma } from '@/lib/db';
import { candidatesOf, normalizeAlias } from './match';
import { categoryOf, tmdb } from './tmdb';
import type { WorkCategory } from './types';

const H = 3_600_000;

export type WorkPick = {
  mediaType: 'tv' | 'movie';
  tmdbId: number;
  title: string;
  year: string | null;
  category: WorkCategory;
  posterPath: string | null;
  popularity: number;
};

/** TMDB 에서 작품 찾기 (다른 작품으로 고칠 때) */
export async function searchWorks(q: string): Promise<WorkPick[]> {
  const query = q.trim();
  if (!query) return [];
  const r = await tmdb<{ results?: any[] }>('/search/multi', { query, include_adult: 'false' });
  return (r.results ?? [])
    .filter((x) => x.media_type === 'tv' || x.media_type === 'movie')
    .slice(0, 8)
    .map((x) => ({
      mediaType: x.media_type,
      tmdbId: x.id,
      title: (x.name || x.title || '').trim(),
      year: (x.first_air_date || x.release_date || '').slice(0, 4) || null,
      category: categoryOf(x.media_type, x),
      posterPath: x.poster_path ?? null,
      popularity: x.popularity ?? 0,
    }));
}

async function ensureWork(p: WorkPick): Promise<string> {
  const id = `${p.mediaType}:${p.tmdbId}`;
  await prisma.radarWork.upsert({
    where: { id },
    create: { id, tmdbId: p.tmdbId, mediaType: p.mediaType, title: p.title, year: p.year, category: p.category, posterPath: p.posterPath, popularity: p.popularity },
    update: {},
  });
  return id;
}

/** 그 말이 들어 있는 최근 영상(직접 고친 건 빼고)을 다시 찾게 — 별칭을 바꾼 뒤 */
async function requeueFor(alias: string): Promise<number> {
  const rows = await prisma.radarVideo.findMany({
    where: { matchLocked: false, publishedAt: { gt: new Date(Date.now() - 30 * 24 * H) } },
    select: { id: true, title: true, tags: true, descTags: true, matchedBy: true },
  });
  const ids = rows
    .filter(
      (r) =>
        (r.matchedBy && normalizeAlias(r.matchedBy) === alias) ||
        candidatesOf(r.title, r.tags, r.descTags).some((c) => normalizeAlias(c.text) === alias)
    )
    .map((r) => r.id);
  if (!ids.length) return 0;
  const r = await prisma.radarVideo.updateMany({ where: { id: { in: ids } }, data: { matchedAt: null } });
  return r.count;
}

/** 이 영상만 다른 작품으로. remember 를 주면 그 말(해시태그 등)도 앞으로 이 작품으로 */
export async function assignVideoWork(videoId: string, pick: WorkPick, remember?: string): Promise<void> {
  const workId = await ensureWork(pick);
  await prisma.radarVideo.update({
    where: { id: videoId },
    data: { workId, guessWorkId: null, matchScore: 9, matchedBy: '직접 지정', matchLocked: true, matchedAt: new Date() },
  });
  const alias = remember ? normalizeAlias(remember) : '';
  if (alias.length >= 2) {
    await prisma.radarAlias.upsert({
      where: { alias },
      create: { alias, workId, source: 'manual' },
      update: { workId, personId: null, source: 'manual', blocked: false, blockReason: null, checkedAt: new Date() },
    });
    await requeueFor(alias);
  }
}

/** 이 영상은 작품 없음 (다시 찾지 않음) */
export async function unmatchVideo(videoId: string): Promise<void> {
  await prisma.radarVideo.update({
    where: { id: videoId },
    data: { workId: null, guessWorkId: null, matchScore: null, matchedBy: '직접 뺌', matchLocked: true, matchedAt: new Date() },
  });
}

/** 추정을 확정으로 */
export async function confirmGuess(videoId: string): Promise<void> {
  const v = await prisma.radarVideo.findUnique({ where: { id: videoId }, select: { guessWorkId: true } });
  if (!v?.guessWorkId) return;
  await prisma.radarVideo.update({
    where: { id: videoId },
    data: { workId: v.guessWorkId, guessWorkId: null, matchScore: 9, matchLocked: true, matchedAt: new Date() },
  });
}

/** 이 말은 작품 아님 — 그 말로 붙은 영상 전체를 다시 찾게 */
export async function blockAlias(text: string): Promise<number> {
  const alias = normalizeAlias(text);
  if (!alias) return 0;
  await prisma.radarAlias.upsert({
    where: { alias },
    create: { alias, blocked: true, blockReason: '직접 막음', source: 'manual' },
    update: { blocked: true, blockReason: '직접 막음', source: 'manual' },
  });
  return requeueFor(alias);
}

export async function unblockAlias(text: string): Promise<void> {
  const alias = normalizeAlias(text);
  await prisma.radarAlias.updateMany({ where: { alias }, data: { blocked: false, blockReason: null, checkedAt: new Date(0) } });
  await requeueFor(alias);
}

/** 이 작품으로 붙게 한 말들 (잘못 잡힌 작품을 고칠 때) */
export async function workAliases(workId: string): Promise<{ text: string; count: number }[]> {
  const rows = await prisma.radarVideo.groupBy({
    by: ['matchedBy'],
    where: { workId, matchedBy: { not: null } },
    _count: { _all: true },
  });
  return rows
    .filter((r) => r.matchedBy && r.matchedBy !== '직접 지정')
    .map((r) => ({ text: r.matchedBy!, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

export type MatchAdmin = {
  stats: { confident: number; guess: number; none: number; locked: number };
  guesses: { id: string; title: string; views: number; publishedAt: string; channel: string; guess: string; guessId: string; by: string | null; score: number | null }[];
  learned: { alias: string; work: string | null; checkedAt: string }[];
  blocked: { alias: string; reason: string | null; work: string | null }[];
};

/** 작품 인식 관리 화면 — 추정 목록, 배운 별칭, 막은 별칭 */
export async function matchAdmin(): Promise<MatchAdmin> {
  const since = new Date(Date.now() - 14 * 24 * H);
  const [confident, guess, none, locked, guesses, learned, blocked] = await Promise.all([
    prisma.radarVideo.count({ where: { publishedAt: { gt: since }, workId: { not: null } } }),
    prisma.radarVideo.count({ where: { publishedAt: { gt: since }, guessWorkId: { not: null } } }),
    prisma.radarVideo.count({ where: { publishedAt: { gt: since }, workId: null, guessWorkId: null, matchedAt: { not: null } } }),
    prisma.radarVideo.count({ where: { matchLocked: true } }),
    prisma.$queryRaw<{ id: string; title: string; views: number; publishedAt: Date; channel: string; guess: string; guessId: string; by: string | null; score: number | null }[]>`
      SELECT v.id, v.title, v.views, v."publishedAt", COALESCE(c."displayName", c."externalId") AS channel,
        w.title AS guess, w.id AS "guessId", v."matchedBy" AS by, v."matchScore" AS score
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId" JOIN "RadarWork" w ON w.id = v."guessWorkId"
      WHERE v."publishedAt" > ${since}
      ORDER BY v.views DESC LIMIT 60`,
    prisma.$queryRaw<{ alias: string; work: string | null; checkedAt: Date }[]>`
      SELECT a.alias, w.title AS work, a."checkedAt" FROM "RadarAlias" a LEFT JOIN "RadarWork" w ON w.id = a."workId"
      WHERE a.source IN ('learned', 'manual') AND NOT a.blocked ORDER BY a."checkedAt" DESC LIMIT 80`,
    prisma.$queryRaw<{ alias: string; reason: string | null; work: string | null }[]>`
      SELECT a.alias, a."blockReason" AS reason, w.title AS work FROM "RadarAlias" a LEFT JOIN "RadarWork" w ON w.id = a."workId"
      WHERE a.blocked ORDER BY a."checkedAt" DESC LIMIT 80`,
  ]);
  return {
    stats: { confident, guess, none, locked },
    guesses: guesses.map((g) => ({ ...g, publishedAt: g.publishedAt.toISOString() })),
    learned: learned.map((l) => ({ ...l, checkedAt: l.checkedAt.toISOString() })),
    blocked,
  };
}
