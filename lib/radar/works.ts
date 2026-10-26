/**
 * 꿀통레이더 작품 화면 데이터 — 수집기가 모은 영상(RadarVideo)과 작품 인식(RadarWork·RadarPerson)으로
 * 막 뜨는 작품 · 출연진의 다른 작품(연관 꿀통·빈자리) · 몰린 작품 · 작품 못 찾은 급상승 쇼츠를 만든다.
 */

import { prisma } from '@/lib/db';
import type { PersonCredit } from './match';
import type { CrowdedWork, RadarData, RelatedWork, RisingWork, ShortClip, WorkCategory } from './types';
import { isHoneyPot } from './types';

const H = 3_600_000;
export type WorksPeriod = '24h' | '3d' | '7d';
const PERIOD_H: Record<WorksPeriod, number> = { '24h': 24, '3d': 72, '7d': 168 };

type CastMember = { id: number; name: string; order: number };

/** 쇼츠 썸네일 — 세로 원본 (화면에서 없으면 작은 걸로 바꾼다) */
const shortThumb = (id: string) => `https://i.ytimg.com/vi/${id}/oardefault.jpg`;

type VideoRow = { id: string; title: string; views: number; publishedAt: Date; channel: string; workId: string | null };

function clip(v: VideoRow): ShortClip {
  return { videoId: v.id, title: v.title, channel: v.channel, views: v.views, publishedAt: v.publishedAt.toISOString(), thumb: shortThumb(v.id) };
}

export async function getRadarData(period: WorksPeriod): Promise<RadarData> {
  const hours = PERIOD_H[period];
  const start = new Date(Date.now() - hours * H);
  const prevStart = new Date(Date.now() - 2 * hours * H);

  // 작품별 기간 안 쇼츠 통계 + 직전 같은 기간 평균 (몰림·추세용)
  const stats = await prisma.$queryRaw<
    {
      workId: string;
      recentShorts: number;
      recentViews: bigint | null;
      maxViews: number | null;
      channels: number;
      avgRecent: number | null;
      avgPrev: number | null;
    }[]
  >`
    SELECT v."workId",
      COUNT(*) FILTER (WHERE v."publishedAt" > ${start})::int AS "recentShorts",
      SUM(v.views) FILTER (WHERE v."publishedAt" > ${start}) AS "recentViews",
      MAX(v.views) FILTER (WHERE v."publishedAt" > ${start}) AS "maxViews",
      COUNT(DISTINCT v."channelId") FILTER (WHERE v."publishedAt" > ${start})::int AS channels,
      AVG(v.views) FILTER (WHERE v."publishedAt" > ${start})::float AS "avgRecent",
      AVG(v.views) FILTER (WHERE v."publishedAt" <= ${start})::float AS "avgPrev"
    FROM "RadarVideo" v
    WHERE v."workId" IS NOT NULL AND v."publishedAt" > ${prevStart} AND COALESCE(v."isShorts", true)
    GROUP BY v."workId"`;
  const active = stats.filter((s) => s.recentShorts > 0);

  const risingIds = [...active].sort((a, b) => Number(b.recentViews ?? 0) - Number(a.recentViews ?? 0)).slice(0, 15).map((s) => s.workId);
  const crowdedStats = active.filter((s) => s.channels >= 4).sort((a, b) => b.channels - a.channels).slice(0, 10);

  const workIds = [...new Set([...risingIds, ...crowdedStats.map((s) => s.workId)])];
  const works = new Map(
    (await prisma.radarWork.findMany({ where: { id: { in: workIds } } })).map((w) => [w.id, w])
  );

  // 뜨는 작품의 기간 안 쇼츠 (대표 쇼츠)
  const recentVideos = workIds.length
    ? await prisma.$queryRaw<VideoRow[]>`
        SELECT v.id, v.title, v.views, v."publishedAt", COALESCE(c."displayName", c."externalId") AS channel, v."workId"
        FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
        WHERE v."workId" = ANY(${workIds}::text[]) AND v."publishedAt" > ${start}
        ORDER BY v.views DESC`
    : [];
  const topBy = new Map<string, VideoRow>();
  for (const v of recentVideos) if (v.workId && !topBy.has(v.workId)) topBy.set(v.workId, v);

  // 출연자 → 다른 출연작
  const castOf = (workId: string): CastMember[] => {
    const raw = works.get(workId)?.cast;
    return Array.isArray(raw) ? (raw as unknown as CastMember[]).filter((c) => c.order < 4) : [];
  };
  const personIds = [...new Set(risingIds.flatMap((id) => castOf(id).map((c) => c.id)))];
  const persons = new Map(
    (await prisma.radarPerson.findMany({ where: { id: { in: personIds } } })).map((p) => [p.id, p])
  );
  const relatedIds = new Set<string>();
  for (const p of persons.values()) for (const c of (p.credits as unknown as PersonCredit[]) ?? []) relatedIds.add(c.workId);

  // 연관 작품의 쇼츠 성적 (수집한 전체 기간 — 최근 35일 + 과거 트래픽)
  const relStats = relatedIds.size
    ? await prisma.$queryRaw<{ workId: string; maxViews: number; millionCount: number; channels: number }[]>`
        SELECT "workId", MAX(views)::int AS "maxViews", COUNT(*) FILTER (WHERE views >= 1000000)::int AS "millionCount",
          COUNT(DISTINCT "channelId")::int AS channels
        FROM "RadarVideo" WHERE "workId" = ANY(${[...relatedIds]}::text[]) GROUP BY "workId"`
    : [];
  const pastStats = relatedIds.size
    ? await prisma.$queryRaw<{ workId: string; maxViews: number; millionCount: number; channels: number }[]>`
        SELECT "workId", MAX(views)::int AS "maxViews", COUNT(*)::int AS "millionCount", COUNT(DISTINCT "channelExternalId")::int AS channels
        FROM "PastHit" WHERE "workId" = ANY(${[...relatedIds]}::text[]) GROUP BY "workId"`
    : [];
  const relBy = new Map(relStats.map((r) => [r.workId, r]));
  for (const p of pastStats) {
    const r = relBy.get(p.workId);
    relBy.set(
      p.workId,
      r
        ? { ...r, maxViews: Math.max(r.maxViews, p.maxViews), millionCount: r.millionCount + p.millionCount }
        : p
    );
  }
  const relTop = relatedIds.size
    ? await prisma.$queryRaw<VideoRow[]>`
        SELECT * FROM (
          SELECT v.id, v.title, v.views, v."publishedAt", COALESCE(c."displayName", c."externalId") AS channel, v."workId",
            ROW_NUMBER() OVER (PARTITION BY v."workId" ORDER BY v.views DESC) AS rn
          FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
          WHERE v."workId" = ANY(${[...relatedIds]}::text[])
        ) t WHERE rn <= 3`
    : [];
  const relTopBy = new Map<string, ShortClip[]>();
  for (const v of relTop) {
    const list = relTopBy.get(v.workId!) ?? [];
    list.push(clip(v));
    relTopBy.set(v.workId!, list);
  }

  const statBy = new Map(active.map((s) => [s.workId, s]));
  const rising: RisingWork[] = [];
  for (const id of risingIds) {
    const w = works.get(id);
    const s = statBy.get(id);
    const top = topBy.get(id);
    if (!w || !s || !top) continue;
    const cast = castOf(id);
    // 출연자별 다른 출연작 → 작품 단위로 합치고 '누구 출연' 을 모은다
    const rel = new Map<string, { c: PersonCredit; via: string[] }>();
    for (const m of cast) {
      const p = persons.get(m.id);
      for (const c of (p?.credits as unknown as PersonCredit[]) ?? []) {
        if (c.workId === id) continue;
        const r = rel.get(c.workId) ?? { c, via: [] };
        if (!r.via.includes(m.name)) r.via.push(m.name);
        rel.set(c.workId, r);
      }
    }
    const related: RelatedWork[] = [];
    // 감시 채널에 쇼츠가 하나도 없는 출연작 — 아직 아무도 안 만든 빈자리
    const unmeasured: PersonCredit[] = [];
    for (const { c, via } of rel.values()) {
      const st = relBy.get(c.workId);
      if (st) {
        related.push({
          key: c.workId,
          title: c.title,
          year: c.year ?? '',
          category: c.category as WorkCategory,
          poster: c.posterPath,
          tags: [],
          via,
          maxViews: st.maxViews,
          millionCount: st.millionCount,
          channels: st.channels,
          topShorts: relTopBy.get(c.workId) ?? [],
        });
      } else {
        unmeasured.push(c);
      }
    }
    related.sort((a, b) => Number(isHoneyPot(b)) - Number(isHoneyPot(a)) || b.maxViews - a.maxViews);
    unmeasured.sort((a, b) => b.popularity - a.popularity);
    rising.push({
      key: id,
      title: w.title,
      year: w.year ?? '',
      category: w.category as WorkCategory,
      poster: w.posterPath,
      tags: w.networks.slice(0, 2),
      onAir: w.onAir,
      cast: cast.map((c) => c.name),
      recentShorts: s.recentShorts,
      recentViews: Number(s.recentViews ?? 0),
      maxViews: s.maxViews ?? 0,
      channels: s.channels,
      spike: s.recentShorts === 1 && s.channels === 1,
      topShort: clip(top),
      related: related.slice(0, 8),
      unmeasured: unmeasured.slice(0, 8).map((c) => ({ title: c.title, year: c.year ?? '', category: c.category as WorkCategory })),
    });
  }

  const crowded: CrowdedWork[] = crowdedStats
    .map((s): CrowdedWork | null => {
      const w = works.get(s.workId);
      if (!w) return null;
      return {
        key: w.id,
        title: w.title,
        year: w.year ?? '',
        category: w.category as WorkCategory,
        poster: w.posterPath,
        tags: w.networks.slice(0, 2),
        onAir: w.onAir,
        channels: s.channels,
        recentShorts: s.recentShorts,
        avgViews: Math.round(s.avgRecent ?? 0),
        trend: s.avgPrev && s.avgPrev > 0 ? Math.round((((s.avgRecent ?? 0) - s.avgPrev) / s.avgPrev) * 100) : 0,
      };
    })
    .filter((x): x is CrowdedWork => !!x);

  const [unmatchedRows, totals, watchedFolders, monitored, last] = await Promise.all([
    prisma.$queryRaw<VideoRow[]>`
      SELECT v.id, v.title, v.views, v."publishedAt", COALESCE(c."displayName", c."externalId") AS channel, v."workId"
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."workId" IS NULL AND v."matchedAt" IS NOT NULL AND v."publishedAt" > ${start} AND COALESCE(v."isShorts", true)
      ORDER BY v.views DESC LIMIT 8`,
    prisma.$queryRaw<{ total: number; matched: number; surging: number }[]>`
      SELECT COUNT(*)::int AS total, COUNT("workId")::int AS matched, COUNT(*) FILTER (WHERE views >= 100000)::int AS surging
      FROM "RadarVideo" WHERE "publishedAt" > ${start} AND "matchedAt" IS NOT NULL AND COALESCE("isShorts", true)`,
    prisma.folder.findMany({ where: { watched: true }, select: { name: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.channel.count({ where: { isActive: true, platform: 'YOUTUBE', folder: { watched: true } } }),
    prisma.trendCache.findUnique({ where: { key: 'radar:last-collect' } }).catch(() => null),
  ]);
  const t = totals[0] ?? { total: 0, matched: 0, surging: 0 };

  return {
    collectedAt: (last?.fetchedAt ?? new Date()).toISOString(),
    monitoredChannels: monitored,
    groups: watchedFolders.map((f) => f.name),
    summary: {
      surgingShorts: t.surging,
      risingWorks: rising.length,
      honeyPots: rising.reduce((a, r) => a + r.related.filter(isHoneyPot).length, 0),
      crowded: crowded.length,
      matchRate: t.total ? Math.round((t.matched / t.total) * 100) : 0,
    },
    rising,
    crowded,
    unmatched: unmatchedRows.map(clip),
  };
}
