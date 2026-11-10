/**
 * 꿀통레이더 수집기 — /api/cron/radar 를 Supabase pg_cron 이 매시 정각·3분·6분에 부른다.
 * 한 번에 60초 제한이라 한 시간 몫을 세 번에 나눠 하고, 할 일이 없으면 바로 끝난다 (할당량을 쓰지 않음).
 *
 * 살아있는 채널 전부를 감시한다. 다만 빠르기가 두 단계:
 *  - 관심 목록 채널: 매시간 정밀하게 (1시간 급상승까지)
 *  - 나머지 전체:   3~6시간마다 (남는 할당량 안에서 — 관심 목록 몫을 먼저 떼어 둔다. 키가 많을수록 촘촘해진다)
 *
 * 한 번 돌 때 시간(약 45초)과 유튜브 할당량 안에서 아래를 차례로 한다. 유튜브 호출은 몇 개씩 동시에 보낸다.
 *  1. 채널 통계  — 관심 목록 채널 매시간, 나머지 6시간마다 (channels.list, 50개 = 1 unit)
 *                 하루 한 번 총 조회수·영상 수를 기록해 하루/7일/30일 조회수와 주당 업로드를 낸다.
 *                 영상 수가 늘었으면 새 영상이 올라온 것
 *  2. 새 영상 찾기 — 영상 수가 늘어난 채널만 (playlistItems, 채널당 1 unit). 관심 목록 채널은 하루 한 번은 꼭
 *  3. 영상 조회수 — videos.list (50개 = 1 unit)
 *                 관심 목록: 72시간 안 매시간 · 7일 안 6시간 · 30일 안 하루 / 나머지: 72시간 안 3시간 · 7일 안 12시간
 *  4. 하루 정리  — 채널 평소 조회(중앙값)·쇼츠/롱폼 구분 계산, 35일 넘은 영상 삭제
 *  5. 작품 인식 — 제목·해시태그·태그로 TMDB 작품을 붙이고, 작품 상세·출연자 출연작을 받아 둔다 (lib/radar/match)
 *  6. 과거 트래픽 — 업로드가 30일 넘게 끊긴 채널의 100만+ 영상(인기 쇼츠·인기 영상 재생목록)을 남기고 채널을 지운다.
 *     옛 영상으로 아직 하루 10만+ 조회가 나오는 채널은 남긴다 (역주행 감시용). 정비 작업(5분)에서 돈다.
 *                 하루에 쓸 몫을 정해 두고(감시 몫을 빼고) 남는 할당량으로 조금씩.
 */

import { prisma } from '@/lib/db';
import {
  QuotaGoneError,
  fetchChannelStats,
  fetchLatestUploadIds,
  fetchPlaylistPage,
  fetchVideos,
  remainingQuota,
  type YtVideo,
} from '@/lib/youtube/api';
import { resetStaleQuotas } from '@/lib/youtube/keyManager';
import { monitorPlan, UNITS_PER_WATCHED_CHANNEL, type MonitorPlan } from './budget';
import { learnAliases } from './learn';
import { discoveryDue, markDiscovered, refreshSuggestions, runDiscovery, type DiscoverReport } from './discover';
import { fetchPersons, fetchWorkDetails, matchVideos, seedWorks } from './match';
import { getSchedule, getSeason, goldenAgeMin, refreshGolden } from './tabs';
import { refreshGoogleRssHistory } from '@/lib/trends/google';
import { runLayoutClassify } from './layout';

/** 다른 기능(키워드 검색 등)이 쓸 몫으로 남겨 두는 할당량 */
const RESERVE_UNITS = 1500;

const INT_MAX = 2_147_483_647;
const H = 3_600_000;

export type CollectReport = {
  startedAt: string;
  ms: number;
  quotaLeft: number | null;
  channelsChecked: number;
  channelsGone: number;
  uploadScans: number;
  newVideos: number;
  videosRefreshed: number;
  videosGone: number;
  maintenance: boolean;
  archivedChannels: number;
  pastHits: number;
  videosMatched: number;
  worksDetailed: number;
  matchError?: string;
  aliasesLearned?: number;
  aliasesBlocked?: number;
  aliasesForgotten?: number;
  /** 이번에 전체 채널을 매시간 쟀나 (키가 넉넉할 때) */
  allHourly?: boolean;
  /** 신규 발굴 (하루 한 번) */
  discover?: DiscoverReport;
  discoverError?: string;
  /** 새 영상 묶음 저장이 실패해 하나씩 넣은 경우 — 첫 오류 · 못 넣은 영상 수 */
  insertError?: string;
  videosSkipped?: number;
  /** 구글 급상승 RSS 기록 수 · 실패 이유 */
  googleRss?: number;
  googleRssError?: string;
  stoppedBy: string | null;
};

/** KST 기준 오늘 날짜 (00:00 UTC 로 표현한 Date — @db.Date 칸에 그대로 넣는다) */
function kstToday(now = new Date()): Date {
  const k = new Date(now.getTime() + 9 * H);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
}

const toMin = (d: Date) => Math.floor(d.getTime() / 60_000);

/** items 를 n 개씩 동시에 처리 (유튜브 호출이 대부분 기다리는 시간이라 묶어서 보낸다) */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function runRadarCollect(opts: { budgetMs?: number } = {}): Promise<CollectReport> {
  const t0 = Date.now();
  const deadline = t0 + (opts.budgetMs ?? 45_000);
  const report: CollectReport = {
    startedAt: new Date(t0).toISOString(),
    ms: 0,
    quotaLeft: null,
    channelsChecked: 0,
    channelsGone: 0,
    uploadScans: 0,
    newVideos: 0,
    videosRefreshed: 0,
    videosGone: 0,
    maintenance: false,
    archivedChannels: 0,
    pastHits: 0,
    videosMatched: 0,
    worksDetailed: 0,
    stoppedBy: null,
  };
  // 날짜가 바뀌었으면 키 사용량부터 0 으로 (남은 할당량 계산이 그 뒤에 와야 한다)
  await resetStaleQuotas();
  let left = (await remainingQuota()) ?? 0;
  /**
   * 단계마다 끝낼 시각(시작부터 ms) — 앞 단계가 일찍 끝나면 뒤 단계가 그만큼 더 쓴다.
   * 작품 인식(TMDB)과 과거 트래픽도 매번 조금씩은 돌게 앞 단계를 먼저 끊는다.
   */
  const phase = (untilMs: number) => {
    const until = Math.min(t0 + untilMs, deadline);
    return {
      until,
      /** 이번에 units 만큼 더 써도 되나 — 시간·할당량 둘 다 본다 */
      canSpend: (units: number) => {
        if (Date.now() > until) {
          report.stoppedBy ??= 'time';
          return false;
        }
        if (left - units < RESERVE_UNITS) {
          report.stoppedBy ??= 'quota';
          return false;
        }
        return true;
      },
    };
  };
  const spend = (units: number) => {
    left -= units;
  };
  /**
   * 관심 목록이 아닌 채널에 쓸 수 있나 — 오늘 남은 시간 동안 관심 목록 감시에 들 몫을 먼저 떼어 둔다.
   * 그래서 키가 모자라도 관심 목록은 매시간 돌고, 키가 늘면 나머지가 그만큼 촘촘해진다.
   */
  const watchedReserve = await watchedNeedForRestOfDay();
  // 키가 넉넉하면 관심 목록이 아닌 채널도 매시간 (모자라면 3~6시간, 관심 목록 몫을 먼저 떼어 둔다)
  const plan = await monitorPlan();
  report.allHourly = plan.allHourly;
  const tierB = (c: (u: number) => boolean) => (units: number) => {
    if (left - units < RESERVE_UNITS + watchedReserve) {
      report.stoppedBy ??= 'quota-other';
      return false;
    }
    return c(units);
  };

  try {
    // 조회수 재기가 '터진 영상'의 핵심이라 맨 먼저 (예전엔 채널 통계가 시간을 다 써서 영상을 하나도 못 다시 쟀다 — 11/9)
    const p1 = phase(16_000).canSpend;
    await stepRefreshVideos(report, p1, tierB(p1), spend, plan.allHourly);
    const p2 = phase(24_000).canSpend;
    await stepChannelStats(report, p2, tierB(p2), spend, plan.allHourly);
    const p3 = phase(27_000).canSpend;
    await stepUploadScan(report, p3, tierB(p3), spend);
    // 신규 발굴 — 하루 한 번 6초. 검색이 100 unit 씩이라 관심 목록 몫을 먼저 떼어 둔 뒤 남는 할당량으로.
    // 직접 넣었거나 pint 목록에서 온 후보는 기다리지 않고 매번 채운다
    // 하루 한 번 유튜브 검색 발굴은 정비 작업(5분)에서 — 여기 6초로는 검색만 하고 채널 확인을 못 했다.
    // 여기서는 직접 넣었거나 pint 목록에서 온 후보만 (기다리지 않게 매번)
    const due = await discoveryDue();
    if (due.pending) {
      const pd = phase(33_000);
      try {
        report.discover = await runDiscovery({ canSpend: tierB(pd.canSpend), spend, deadline: pd.until, search: false });
      } catch (e) {
        if (e instanceof QuotaGoneError) throw e;
        report.discoverError = (e as Error).message.slice(0, 200);
      }
    }
    // 하루 한 번 정비 · 6시간마다 별칭 배우기는 무거워서 따로 (runRadarMaintenance — /api/cron/radar-maint, 5분 한도)
    // 작품 인식 — TMDB (유튜브 할당량 안 씀). 실패해도 다른 단계는 계속
    // 작품 찾기가 시간을 다 쓰면 상세·출연작을 못 받아서, 각자 몫을 따로 둔다.
    // 전체 채널을 매시간 재면서 새 영상이 시간당 만 개 넘게 들어와, 작품 찾기 몫을 넉넉히 (새 영상 찾기는 27초까지)
    const m = phase(37_000).until;
    const m2 = phase(41_000).until;
    try {
      const r = await matchVideos(m);
      report.videosMatched = r.matched;
      report.worksDetailed = await fetchWorkDetails(m2);
      await fetchPersons(m2);
      // 편성표·시즌·오픈 TMDB 조회를 미리 받아 둔다 (6시간 캐시라 대부분은 바로 끝남) — 화면이 빨리 열리게.
      // 거기 나온 작품은 작품 목록에 넣어 둬서, 해시태그가 없어도 제목만으로 알아보게
      if (Date.now() < m2) {
        const [sched, season] = await Promise.all([getSchedule(), getSeason()]);
        await seedWorks([...sched.flatMap((d) => d.items), ...season]);
      }
    } catch (e) {
      report.matchError = (e as Error).message.slice(0, 200);
    }
    // 과거 트래픽(끊긴 채널 정리)은 정비 작업(5분)으로 옮겼다 — 수집기 끝에선 시간이 모자라 밀리기만 했다
    // 구글 급상승 공개 RSS — 지금 목록만 주므로 매시간 받아 쌓아 둔다 (트렌드 탭 · AI 분석이 24시간·7일 범위로 꺼내 씀)
    if (Date.now() < deadline - 2_000) {
      try {
        report.googleRss = (await refreshGoogleRssHistory()).length;
      } catch (e) {
        report.googleRssError = (e as Error).message.slice(0, 120);
      }
    }
  } catch (e) {
    if (e instanceof QuotaGoneError) report.stoppedBy = 'quota';
    else throw e;
  }

  report.ms = Date.now() - t0;
  report.quotaLeft = await remainingQuota();
  await prisma.trendCache
    .upsert({
      where: { key: 'radar:last-collect' },
      create: { key: 'radar:last-collect', payload: report as object },
      update: { payload: report as object, fetchedAt: new Date() },
    })
    .catch(() => {});
  return report;
}

/* ───────────── 정비 (따로 — 5분 한도) ───────────── */

export type MaintenanceReport = {
  ms: number;
  /** 하루 한 번 정비(채널 평소 조회 · 쇼츠/롱폼 · 35일 지난 영상 지우기)를 했나 */
  daily: boolean;
  aliases: { learned: number; blocked: number; forgotten: number } | null;
  resuggested: number;
  /** 하루 한 번 유튜브 검색 발굴 (할 때가 됐을 때만) */
  discover?: DiscoverReport;
  /** 끊긴 채널 정리 — 지운 채널 · 과거 트래픽에 남긴 영상 */
  archived?: { archivedChannels: number; pastHits: number };
  /** 쇼츠 화면 구성 분류 — 이번에 분류한 채널 · 비용 · 남은 대상 */
  layout?: { classified: number; costKrw: number; left: number };
  /** 황금키워드를 다시 계산했나 */
  golden?: boolean;
  errors: string[];
};

/**
 * 수집기(60초) 안에서 돌리면 시간을 넘기는 일 — 하루 한 번 정비, 6시간마다 별칭 배우기, 팩 말 · 후보 추천 다시 계산, 하루 한 번 신규 발굴 검색.
 * pg_cron 이 2시간마다 /api/cron/radar-maint 로 부른다. 할 때가 아닌 건 바로 건너뛴다.
 * (예전엔 수집기 안에 있어서, 이틀 밀린 뒤엔 매번 60초를 넘겨 수집 기록도 못 남겼다)
 */
export async function runRadarMaintenance(): Promise<MaintenanceReport> {
  const t0 = Date.now();
  const out: MaintenanceReport = { ms: 0, daily: false, aliases: null, resuggested: 0, errors: [] };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      out.errors.push(`${name}: ${(e as Error).message.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  };
  await step('daily', async () => {
    out.daily = await stepDailyMaintenance();
  });
  await step('learn', async () => {
    // 6시간마다: 같이 붙는 해시태그로 별칭 배우기 · 작품과 상관없는 채널에서만 나오는 짧은 별칭 막기
    const lm = await prisma.trendCache.findUnique({ where: { key: 'radar:learn' } }).catch(() => null);
    if (lm && Date.now() - lm.fetchedAt.getTime() <= 6 * H) return;
    const lr = await learnAliases();
    out.aliases = { learned: lr.learned, blocked: lr.blocked, forgotten: lr.forgotten };
    await prisma.trendCache.upsert({ where: { key: 'radar:learn' }, create: { key: 'radar:learn', payload: lr }, update: { payload: lr, fetchedAt: new Date() } });
  });
  await step('golden', async () => {
    // 황금키워드 미리 계산 (화면은 저장해 둔 걸 바로 보여 준다) — 90분 넘었을 때만
    const age = await goldenAgeMin();
    if (age != null && age < 90) return;
    await refreshGolden();
    out.golden = true;
  });
  await step('suggest', async () => {
    out.resuggested = (await refreshSuggestions(t0 + 180_000)).resuggested;
  });
  await step('discover', async () => {
    // 하루 한 번 — 검색 8번 · 인기 급상승 · 추천 채널 → 처음 보는 채널 통계 · 최근 영상 확인 (함수 한도 300초 안에서)
    const due = await discoveryDue();
    if (!due.search || Date.now() > t0 + 200_000) return;
    let left = (await remainingQuota()) ?? 0;
    const reserve = RESERVE_UNITS + (await watchedNeedForRestOfDay());
    const rep = await runDiscovery({
      canSpend: (u) => left - u >= reserve,
      spend: (u) => {
        left -= u;
      },
      deadline: t0 + 270_000,
      search: true,
    });
    out.discover = rep;
    await markDiscovered(rep);
  });
  await step('archive', async () => {
    // 업로드가 30일 넘게 끊긴 채널: 100만+ 영상을 과거 트래픽에 남기고 지운다 (관심 목록 감시 몫을 떼어 둔 할당량 안에서)
    if (Date.now() > t0 + 150_000) return;
    const plan = await monitorPlan();
    let left = (await remainingQuota()) ?? 0;
    const reserve = RESERVE_UNITS + (await watchedNeedForRestOfDay());
    const until = t0 + 175_000;
    const rep = { archivedChannels: 0, pastHits: 0 };
    while (Date.now() < until) {
      const before = rep.archivedChannels;
      await stepArchive(
        rep,
        (u) => Date.now() < until && left - u >= reserve,
        (u) => {
          left -= u;
        },
        plan
      );
      if (rep.archivedChannels === before) break;
    }
    out.archived = rep;
  });
  await step('layout', async () => {
    // 남은 시간 동안 썸네일로 화면 구성 분류 (한 번에 최대 120곳, 다 하면 30일 뒤에 다시)
    if (Date.now() > t0 + 190_000) return;
    out.layout = await runLayoutClassify({ deadline: t0 + 285_000, max: 120 });
  });
  out.ms = Date.now() - t0;
  await prisma.trendCache
    .upsert({ where: { key: 'radar:last-maint' }, create: { key: 'radar:last-maint', payload: out as object }, update: { payload: out as object, fetchedAt: new Date() } })
    .catch(() => {});
  return out;
}

/* ───────────── 1. 채널 통계 ───────────── */

async function stepChannelStats(
  report: CollectReport,
  canSpend: (u: number) => boolean,
  canSpendOther: (u: number) => boolean,
  spend: (u: number) => void,
  allHourly: boolean
) {
  const today = kstToday();
  const hourAgo = new Date(Date.now() - H);
  const sixAgo = new Date(Date.now() - 6 * H);
  const base = { platform: 'YOUTUBE' as const, isActive: true, externalId: { startsWith: 'UC' } };
  // 관심 목록 채널은 매시간, 나머지는 키가 넉넉하면 3시간·모자라면 6시간마다 (그리고 하루 기록은 꼭).
  // 전체를 매시간 다시 쓰면 작은 DB 가 버티지 못해 다른 단계가 못 돌았다
  const otherAgo = allHourly ? new Date(Date.now() - 3 * H) : sixAgo;
  const watched = await prisma.channel.findMany({
    where: { ...base, folder: { watched: true }, OR: [{ statsCheckedAt: null }, { statsCheckedAt: { lt: hourAgo } }] },
    select: { id: true, externalId: true },
    orderBy: { statsCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: 700,
  });
  const others = await prisma.channel.findMany({
    where: {
      ...base,
      folder: { watched: false },
      OR: [{ statsCheckedAt: null }, { statsCheckedAt: { lt: otherAgo } }, { historyDate: null }, { historyDate: { lt: today } }],
    },
    select: { id: true, externalId: true, historyDate: true },
    orderBy: { statsCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: allHourly ? 2500 : 1500,
  });
  const run = async (list: { id: string; externalId: string }[], can: (u: number) => boolean) => {
    const byExt = new Map(list.map((c) => [c.externalId, c.id]));
    await pool(chunks([...byExt.keys()], 50), 16, async (slice) => {
      if (!can(1)) return;
      const stats = await fetchChannelStats(slice);
      spend(1);
      const got = new Set(stats.map((s) => s.id));
      const gone = slice.filter((x) => !got.has(x)).map((x) => byExt.get(x)!);
      if (stats.length) await applyChannelStats(stats, byExt, today);
      if (gone.length) {
        // 채널이 없어짐(삭제·정지) — 끈다
        await prisma.channel.updateMany({ where: { id: { in: gone } }, data: { isActive: false, statsCheckedAt: new Date() } });
        report.channelsGone += gone.length;
      }
      report.channelsChecked += stats.length;
    });
  };
  await run(watched, canSpend);
  // 나머지: 오늘 기록(채널 순위)이 없는 건 꼭, 6시간 갱신만 남는 할당량으로
  const needDaily = others.filter((c) => !c.historyDate || c.historyDate < today);
  const sixHourly = others.filter((c) => c.historyDate && c.historyDate >= today);
  await run(needDaily, canSpend);
  await run(sixHourly, canSpendOther);
}

async function applyChannelStats(
  stats: Awaited<ReturnType<typeof fetchChannelStats>>,
  byExt: Map<string, string>,
  today: Date
) {
  const ids = stats.map((s) => byExt.get(s.id)!);
  const subs = stats.map((s) => s.subscriberCount);
  const views = stats.map((s) => (s.viewCount == null ? null : s.viewCount.toString()));
  const vcs = stats.map((s) => s.videoCount);
  const titles = stats.map((s) => s.title);
  const thumbs = stats.map((s) => s.thumbnailUrl);
  // 날짜는 글자로 넘긴다 — 한 묶음이 전부 null 이면 Prisma 가 정수 배열로 보내 timestamp[] 변환이 실패한다
  const created = stats.map((s) => s.createdAt?.toISOString() ?? null);
  const day = today.toISOString().slice(0, 10);

  // ① 숫자 갱신 + 오늘 처음이면 기록에 덧붙인다 (빠진 날은 null 로 채워 하루치 증가분이 부풀지 않게)
  await prisma.$executeRaw`
    UPDATE "Channel" c SET
      "subscriberCount" = COALESCE(u.subs, c."subscriberCount"),
      "totalViewCount"  = COALESCE(u.views, c."totalViewCount"),
      "videoCount"      = COALESCE(u.vc, c."videoCount"),
      "displayName"     = COALESCE(c."displayName", u.title),
      "thumbnailUrl"    = COALESCE(u.thumb, c."thumbnailUrl"),
      "channelCreatedAt" = COALESCE(c."channelCreatedAt", u.created::timestamp),
      "statsCheckedAt"  = NOW(),
      -- 처음 본 영상 수를 기준으로 (관심 목록이 아닌 채널은 이 뒤로 늘어난 것만 찾아본다)
      "uploadsSeenCount" = COALESCE(c."uploadsSeenCount", u.vc),
      "lastUploadAt" = CASE
        WHEN u.vc IS NOT NULL AND c."videoCount" IS NOT NULL AND u.vc > c."videoCount"
             AND (c."lastUploadAt" IS NULL OR c."lastUploadAt" < NOW() - INTERVAL '1 hour')
        THEN NOW() ELSE c."lastUploadAt" END,
      "dailyViewsPrev" = CASE WHEN c."historyDate" IS DISTINCT FROM ${day}::date THEN c."dailyViews" ELSE c."dailyViewsPrev" END,
      "viewHistory" = CASE WHEN c."historyDate" IS DISTINCT FROM ${day}::date THEN (
          c."viewHistory"
          || array_fill(NULL::bigint, ARRAY[CASE WHEN c."historyDate" IS NULL THEN 0 ELSE LEAST(GREATEST(${day}::date - c."historyDate" - 1, 0), 30) END])
          || ARRAY[u.views]
        )[GREATEST(1, cardinality(c."viewHistory") + 2 + CASE WHEN c."historyDate" IS NULL THEN 0 ELSE LEAST(GREATEST(${day}::date - c."historyDate" - 1, 0), 30) END - 31):]
        ELSE c."viewHistory" END,
      "videoCountHistory" = CASE WHEN c."historyDate" IS DISTINCT FROM ${day}::date THEN (
          c."videoCountHistory"
          || array_fill(NULL::int, ARRAY[CASE WHEN c."historyDate" IS NULL THEN 0 ELSE LEAST(GREATEST(${day}::date - c."historyDate" - 1, 0), 30) END])
          || ARRAY[u.vc]
        )[GREATEST(1, cardinality(c."videoCountHistory") + 2 + CASE WHEN c."historyDate" IS NULL THEN 0 ELSE LEAST(GREATEST(${day}::date - c."historyDate" - 1, 0), 30) END - 31):]
        ELSE c."videoCountHistory" END,
      "historyDate" = ${day}::date
    FROM unnest(
      ${ids}::text[], ${subs}::int[], ${views}::bigint[], ${vcs}::int[],
      ${titles}::text[], ${thumbs}::text[], ${created}::text[]
    ) AS u(id, subs, views, vc, title, thumb, created)
    WHERE c.id = u.id`;

  // ② 기록으로 하루·7일·30일 조회수와 주당 업로드를 다시 낸다.
  //    기록이 하나뿐이면 하루 조회수는 그대로 둔다 (pint 에서 받은 값으로 시작)
  await prisma.$executeRaw`
    WITH x AS (
      SELECT id, "viewHistory" v, "videoCountHistory" vc, cardinality("viewHistory") n
      FROM "Channel" WHERE id = ANY(${ids}::text[])
    )
    UPDATE "Channel" c SET
      "dailyViews" = CASE WHEN x.n >= 2 AND x.v[x.n] IS NOT NULL AND x.v[x.n - 1] IS NOT NULL
        THEN LEAST(GREATEST(x.v[x.n] - x.v[x.n - 1], 0), ${INT_MAX})::int ELSE c."dailyViews" END,
      "weekViews" = CASE WHEN x.n >= 8 AND x.v[x.n] IS NOT NULL AND x.v[x.n - 7] IS NOT NULL
        THEN GREATEST(x.v[x.n] - x.v[x.n - 7], 0) ELSE NULL END,
      "monthViews" = CASE WHEN x.n >= 31 AND x.v[x.n] IS NOT NULL AND x.v[x.n - 30] IS NOT NULL
        THEN GREATEST(x.v[x.n] - x.v[x.n - 30], 0) ELSE NULL END,
      "weeklyUploads" = CASE WHEN x.n >= 8 AND x.vc[x.n] IS NOT NULL AND x.vc[GREATEST(1, x.n - 28)] IS NOT NULL
        THEN GREATEST(x.vc[x.n] - x.vc[GREATEST(1, x.n - 28)], 0)::float / ((x.n - GREATEST(1, x.n - 28))::float / 7)
        ELSE c."weeklyUploads" END
    FROM x WHERE c.id = x.id`;
}

/* ───────────── 2. 새 영상 찾기 ───────────── */

async function stepUploadScan(
  report: CollectReport,
  canSpend: (u: number) => boolean,
  canSpendOther: (u: number) => boolean,
  spend: (u: number) => void
) {
  const dayAgo = new Date(Date.now() - 24 * H);
  type Cand = { id: string; externalId: string; videoCount: number | null; seen: number | null; first: boolean; watched: boolean };
  // 관심 목록: 처음 보는 채널·하루 넘게 안 본 채널·영상 수가 늘어난 채널
  const watched = await prisma.$queryRaw<Cand[]>`
    SELECT c.id, c."externalId", c."videoCount", c."uploadsSeenCount" AS seen, (c."uploadsCheckedAt" IS NULL) AS first, TRUE AS watched
    FROM "Channel" c JOIN "Folder" f ON f.id = c."folderId"
    WHERE c."isActive" AND c.platform = 'YOUTUBE' AND c."externalId" LIKE 'UC%' AND f.watched
      AND (c."uploadsCheckedAt" IS NULL OR c."uploadsCheckedAt" < ${dayAgo}
        OR (c."videoCount" IS NOT NULL AND c."videoCount" > COALESCE(c."uploadsSeenCount", 0)))
    ORDER BY (c."videoCount" > COALESCE(c."uploadsSeenCount", 0)) DESC, c."dailyViews" DESC NULLS LAST, c."uploadsCheckedAt" ASC NULLS FIRST
    LIMIT 600`;
  // 나머지: 영상 수가 늘어난 채널만 (처음 본 채널통계의 영상 수가 기준 — 감시를 시작한 뒤 올라온 것부터)
  const others = await prisma.$queryRaw<Cand[]>`
    SELECT c.id, c."externalId", c."videoCount", c."uploadsSeenCount" AS seen, (c."uploadsCheckedAt" IS NULL) AS first, FALSE AS watched
    FROM "Channel" c JOIN "Folder" f ON f.id = c."folderId"
    WHERE c."isActive" AND c.platform = 'YOUTUBE' AND c."externalId" LIKE 'UC%' AND NOT f.watched
      AND c."uploadsSeenCount" IS NOT NULL AND c."videoCount" > c."uploadsSeenCount"
    ORDER BY c."dailyViews" DESC NULLS LAST, c."uploadsCheckedAt" ASC NULLS FIRST
    LIMIT 900`;
  // 관심 목록과 나머지를 번갈아 — 관심 목록 채널을 처음 훑는 날에도 나머지 채널 새 영상이 밀리지 않게
  const candidates: Cand[] = [];
  for (let i = 0; i < Math.max(watched.length, others.length); i++) {
    if (i < watched.length) candidates.push(watched[i]);
    if (i < others.length) candidates.push(others[i]);
  }
  if (!candidates.length) return;

  const cutoff = new Date(Date.now() - 30 * 24 * H);
  // 조금씩 끊어서 훑고 → 상세 받고 → 저장. 시간이 다 되면 거기서 멈춰도 한 일은 남는다
  // (예전엔 다 모은 뒤 끝에 한 번에 저장해서, 함수가 60초에 끊기면 매번 같은 채널을 다시 훑었다)
  // 세 묶음씩 동시에 (유튜브 응답·저장을 기다리는 동안 다음 묶음을 훑게)
  let stop = false;
  await pool(chunks(candidates, 40), 3, async (round) => {
    if (stop || !canSpend(1)) return;
    const owner = new Map<string, string>();
    const scanned: Cand[] = [];
    await pool(round, 12, async (ch) => {
      if (!(ch.watched ? canSpend(2) : canSpendOther(2))) return;
      // 관심 목록 채널을 처음 볼 땐 50개 — 7~30일 된 영상으로 채널 평소 조회(중앙값)를 바로 낼 수 있게.
      // 나머지는 늘어난 만큼만 (조금 넉넉히)
      const max = ch.watched ? (ch.first ? 50 : 15) : Math.min(15, Math.max(3, (ch.videoCount ?? 0) - (ch.seen ?? 0) + 2));
      const ids = await fetchLatestUploadIds(ch.externalId, max, cutoff).catch((e) => {
        if (e instanceof QuotaGoneError) throw e;
        return [] as string[];
      });
      spend(1);
      scanned.push(ch);
      for (const id of ids) owner.set(id, ch.id);
    });
    if (!scanned.length) {
      stop = true;
      return;
    }
    report.uploadScans += scanned.length;

    const ids = [...owner.keys()];
    if (ids.length) {
      const known = new Set((await prisma.radarVideo.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((v) => v.id));
      const fresh = ids.filter((id) => !known.has(id));
      const vids: Awaited<ReturnType<typeof fetchVideos>> = [];
      await pool(chunks(fresh, 50), 6, async (slice) => {
        spend(1);
        vids.push(...(await fetchVideos(slice)));
      });
      const nowMin = toMin(new Date());
      const rows = vids
        .filter((v) => !v.upcoming && v.publishedAt >= cutoff && owner.has(v.id))
        .map((v) => ({
          id: v.id,
          channelId: owner.get(v.id)!,
          title: v.title,
          thumbnailUrl: v.thumbnailUrl,
          publishedAt: v.publishedAt,
          durationSec: v.durationSec,
          isShorts: v.isShorts,
          views: v.views,
          likes: v.likes,
          comments: v.comments,
          tags: v.tags,
          descTags: v.descTags ?? [],
          descAt: v.descTags ? new Date() : null,
          trackT: [nowMin],
          trackV: [v.views],
          ...gainsFor(v.publishedAt, [nowMin], [v.views], nowMin),
          checkedAt: new Date(),
        }));
      if (rows.length) {
        try {
          const r = await prisma.radarVideo.createMany({ data: rows, skipDuplicates: true });
          report.newVideos += r.count;
        } catch (e) {
          // 묶음에 이상한 영상 하나가 섞여도 나머지는 넣고 수집을 이어 간다 (예전엔 매시간 여기서 통째로 멈췄다)
          report.insertError ??= (e as Error).message.replace(/\s+/g, ' ').slice(-160);
          for (const row of rows) {
            try {
              report.newVideos += (await prisma.radarVideo.createMany({ data: [row], skipDuplicates: true })).count;
            } catch {
              report.videosSkipped = (report.videosSkipped ?? 0) + 1;
            }
          }
        }
      }
    }

    // 본 채널: 본 시각·그때 영상 수·마지막 업로드 — 한 번에 (채널마다 따로 쓰면 수백 번 왕복이라 느리다)
    await prisma.$executeRaw`
      UPDATE "Channel" c SET
        "uploadsCheckedAt" = NOW(),
        "uploadsSeenCount" = COALESCE(u.vc, c."uploadsSeenCount"),
        "lastUploadAt" = GREATEST(c."lastUploadAt", (SELECT MAX(v."publishedAt") FROM "RadarVideo" v WHERE v."channelId" = c.id))
      FROM unnest(${scanned.map((c) => c.id)}::text[], ${scanned.map((c) => c.videoCount)}::int[]) AS u(id, vc)
      WHERE c.id = u.id`;
  });
}

/* ───────────── 3. 영상 조회수 ───────────── */

/**
 * 최근 N시간 동안 늘어난 조회수.
 *  - N시간 전(또는 그보다 앞) 기록이 있으면 지금 - 그때
 *  - 영상이 N시간보다 어리면 게시 이후 전부 (게시 때 0회)
 *  - 기록이 모자라면 남은 기록으로 N시간치를 어림 (30분 이상 쌓였을 때만)
 */
function gainOver(hours: number, publishedAt: Date, t: number[], v: number[], nowMin: number): number | null {
  const n = t.length;
  if (!n) return null;
  const now = v[n - 1];
  const target = nowMin - hours * 60;
  if (toMin(publishedAt) >= target) return now;
  for (let i = n - 1; i >= 0; i--) {
    if (t[i] <= target + 5) return Math.max(0, now - v[i]);
  }
  const span = t[n - 1] - t[0];
  if (span < 30) return null;
  return Math.max(0, Math.round(((now - v[0]) * hours * 60) / span));
}

function gainsFor(publishedAt: Date, t: number[], v: number[], nowMin: number) {
  return {
    gain1h: gainOver(1, publishedAt, t, v, nowMin),
    gain3h: gainOver(3, publishedAt, t, v, nowMin),
    gain6h: gainOver(6, publishedAt, t, v, nowMin),
    gain12h: gainOver(12, publishedAt, t, v, nowMin),
    gain24h: gainOver(24, publishedAt, t, v, nowMin),
    gain48h: gainOver(48, publishedAt, t, v, nowMin),
  };
}

async function stepRefreshVideos(
  report: CollectReport,
  canSpend: (u: number) => boolean,
  canSpendOther: (u: number) => boolean,
  spend: (u: number) => void,
  allHourly: boolean
) {
  // 관심 목록(키가 넉넉하면 전체): 72시간 안 매시간 · 7일 안 6시간 · 30일 안 하루 / 나머지: 72시간 안 3시간 · 7일 안 12시간
  // 나이 구간마다 따로 고른다 — publishedAt 인덱스로 그 구간만 읽게 (한 쿼리로 영상 전체를 훑으면 작은 DB 에서 10초+ 걸려
  // 고르는 사이에 이 단계 시간이 다 가서 하나도 못 쟀다). 고를 때는 id 만, 측정 기록 배열은 실제로 잴 묶음만 읽는다
  type Due = { id: string; publishedAt: Date; channelId: string; checkedAt: Date | null };
  // 「가장 오래 안 잰 순」으로 정렬하면 구간의 영상을 다 읽어야 해서(0~3일만 2만 9천 개, 작은 DB 에서 8초+) —
  // publishedAt 인덱스를 최신부터 거꾸로 읽다가 limit 만큼 차면 멈춘다. 잰 영상은 50분 동안 빠지니 다음 번엔 그다음 것들을 잰다
  const tier = (fromH: number, toH: number, staleMin: number, limit: number) =>
    prisma.$queryRaw<Due[]>`
      SELECT v.id, v."publishedAt", v."channelId", v."checkedAt" FROM "RadarVideo" v
      WHERE v."publishedAt" > NOW() - make_interval(hours => ${toH}::int) AND v."publishedAt" <= NOW() - make_interval(hours => ${fromH}::int)
        AND (v."checkedAt" IS NULL OR v."checkedAt" < NOW() - make_interval(mins => ${staleMin}::int))
      ORDER BY v."publishedAt" DESC
      LIMIT ${limit}::int`;
  // 하나씩 차례로 (동시에 돌리면 작은 DB 에서 서로 느려진다). 뒤 구간은 시간이 남을 때만
  const phaseEnd = Date.now() + 6_000;
  const t1 = [...(await tier(0, 24, 50, 2000)), ...(await tier(24, 72, 50, 1500))];
  const t2 = Date.now() < phaseEnd ? await tier(72, 168, 360, 500) : [];
  const t3 = Date.now() < phaseEnd ? await tier(168, 720, 1440, 300) : [];
  const chIds = [...new Set([...t1, ...t2, ...t3].map((v) => v.channelId))];
  const chs = chIds.length
    ? await prisma.channel.findMany({ where: { id: { in: chIds } }, select: { id: true, isActive: true, folder: { select: { watched: true } } } })
    : [];
  const activeCh = new Set(chs.filter((c) => c.isActive).map((c) => c.id));
  const watchedCh = new Set(chs.filter((c) => c.folder.watched).map((c) => c.id));
  const isW = (v: Due) => allHourly || watchedCh.has(v.channelId);
  const now = Date.now();
  const staleBy = (v: Due, min: number) => !v.checkedAt || now - v.checkedAt.getTime() > min * 60_000;
  const due = [
    // 72시간 안 — 관심 아닌 채널은 170분 지난 것만 (쿼리는 50분 기준으로 골랐다)
    ...t1.filter((v) => isW(v) || staleBy(v, 170)),
    // 3~7일 — 관심 아닌 채널은 12시간
    ...t2.filter((v) => isW(v) || staleBy(v, 720)),
    // 7~30일 — 관심(또는 전체 매시간)만
    ...t3.filter(isW),
  ]
    // 감시에서 뺀(비활성) 채널 영상은 재지 않는다
    .filter((v) => activeCh.has(v.channelId))
    .map((v) => ({ id: v.id, publishedAt: v.publishedAt, watched: isW(v) }));

  const watchedDue = due.filter((v) => v.watched);
  const otherDue = due.filter((v) => !v.watched);
  const batches = [
    ...chunks(watchedDue, 50).map((b) => ({ b, can: canSpend })),
    ...chunks(otherDue, 50).map((b) => ({ b, can: canSpendOther })),
  ];
  await pool(batches, 12, async ({ b: slice, can }) => {
    if (!can(1)) return;
    // 설명란(snippet)도 같이 — videos.list 는 받는 부분이 늘어도 1 unit 이라 공짜. 아직 안 읽은 영상의 설명란 작품 단서를 채운다
    const [stats, tracks] = await Promise.all([
      fetchVideos(
        slice.map((v) => v.id),
        true
      ),
      prisma.radarVideo.findMany({ where: { id: { in: slice.map((v) => v.id) } }, select: { id: true, trackT: true, trackV: true } }),
    ]);
    spend(1);
    const byId = new Map(stats.map((s) => [s.id, s]));
    const trackOf = new Map(tracks.map((t) => [t.id, t]));
    const nowMin = toMin(new Date());
    const keepFrom = nowMin - 72 * 60;

    const ids: string[] = [];
    const views: number[] = [];
    const likes: (number | null)[] = [];
    const comments: (number | null)[] = [];
    const tT: string[] = [];
    const tV: string[] = [];
    const descJson: string[] = [];
    const g: (number | null)[][] = [[], [], [], [], [], []];
    const gone: string[] = [];
    for (const row of slice) {
      const s = byId.get(row.id);
      if (!s) {
        gone.push(row.id);
        continue;
      }
      // 72시간 넘은 기록은 버리되, 24시간 전 비교용으로 바로 앞 하나는 남긴다
      const tr = trackOf.get(row.id);
      let t = [...(tr?.trackT ?? []), nowMin];
      let v = [...(tr?.trackV ?? []), s.views];
      const firstKeep = t.findIndex((x) => x >= keepFrom);
      if (firstKeep > 1) {
        t = t.slice(firstKeep - 1);
        v = v.slice(firstKeep - 1);
      }
      const gains = gainsFor(row.publishedAt, t, v, nowMin);
      ids.push(row.id);
      views.push(s.views);
      likes.push(s.likes);
      comments.push(s.comments);
      descJson.push(JSON.stringify(s.descTags ?? []));
      tT.push(`{${t.join(',')}}`);
      tV.push(`{${v.join(',')}}`);
      g[0].push(gains.gain1h);
      g[1].push(gains.gain3h);
      g[2].push(gains.gain6h);
      g[3].push(gains.gain12h);
      g[4].push(gains.gain24h);
      g[5].push(gains.gain48h);
    }
    if (ids.length) {
      await prisma.$executeRaw`
        UPDATE "RadarVideo" r SET
          views = u.views, likes = COALESCE(u.likes, r.likes), comments = COALESCE(u.comments, r.comments),
          "trackT" = u.tt::int[], "trackV" = u.tv::int[],
          "gain1h" = u.g1, "gain3h" = u.g3, "gain6h" = u.g6, "gain12h" = u.g12, "gain24h" = u.g24, "gain48h" = u.g48,
          "checkedAt" = NOW(),
          -- 설명란을 처음 읽은 영상: 단서를 저장하고 작품을 다시 찾게 (직접 고친 영상은 그대로)
          "descTags" = CASE WHEN r."descAt" IS NULL THEN ARRAY(SELECT jsonb_array_elements_text(u.dj::jsonb)) ELSE r."descTags" END,
          "matchedAt" = CASE WHEN r."descAt" IS NULL AND NOT r."matchLocked" THEN NULL ELSE r."matchedAt" END,
          "descAt" = COALESCE(r."descAt", NOW())
        FROM unnest(
          ${ids}::text[], ${views}::int[], ${likes}::int[], ${comments}::int[], ${tT}::text[], ${tV}::text[],
          ${g[0]}::int[], ${g[1]}::int[], ${g[2]}::int[], ${g[3]}::int[], ${g[4]}::int[], ${g[5]}::int[], ${descJson}::text[]
        ) AS u(id, views, likes, comments, tt, tv, g1, g3, g6, g12, g24, g48, dj)
        WHERE r.id = u.id`;
      report.videosRefreshed += ids.length;
    }
    if (gone.length) {
      // 삭제·비공개된 영상
      await prisma.radarVideo.deleteMany({ where: { id: { in: gone } } });
      report.videosGone += gone.length;
    }
  });
}

/* ───────────── 4. 하루 정리 ───────────── */

/** KST 새벽 4시 이후 하루 한 번. 했으면 true */
async function stepDailyMaintenance(): Promise<boolean> {
  const today = kstToday().toISOString().slice(0, 10);
  const kstHour = new Date(Date.now() + 9 * H).getUTCHours();
  if (kstHour < 4) return false;
  const mark = await prisma.trendCache.findUnique({ where: { key: 'radar:maintenance' } }).catch(() => null);
  if ((mark?.payload as { day?: string } | null)?.day === today) return false;

  // 채널 평소 조회 — 7~30일 된 영상 조회수 중앙값 (5개 이상일 때)
  await prisma.$executeRaw`
    UPDATE "Channel" c SET "baselineMedian" = b.med
    FROM (
      SELECT "channelId", percentile_cont(0.5) WITHIN GROUP (ORDER BY views)::int AS med
      FROM "RadarVideo"
      WHERE "publishedAt" BETWEEN NOW() - INTERVAL '30 days' AND NOW() - INTERVAL '7 days'
      GROUP BY "channelId" HAVING COUNT(*) >= 5
    ) b
    WHERE c.id = b."channelId"`;
  // 쇼츠/롱폼 — 최근 30일 영상 중 쇼츠 비율
  await prisma.$executeRaw`
    UPDATE "Channel" c SET "contentFormat" = CASE WHEN s.r >= 0.8 THEN 'shorts' WHEN s.r <= 0.2 THEN 'long' ELSE 'hybrid' END
    FROM (
      SELECT "channelId", AVG(CASE WHEN "isShorts" THEN 1 ELSE 0 END) AS r
      FROM "RadarVideo" WHERE "publishedAt" > NOW() - INTERVAL '30 days'
      GROUP BY "channelId" HAVING COUNT(*) >= 3
    ) s
    WHERE c.id = s."channelId"`;
  await prisma.radarVideo.deleteMany({ where: { publishedAt: { lt: new Date(Date.now() - 35 * 24 * H) } } });

  await prisma.trendCache.upsert({
    where: { key: 'radar:maintenance' },
    create: { key: 'radar:maintenance', payload: { day: today } },
    update: { payload: { day: today }, fetchedAt: new Date() },
  });
  return true;
}

/** 오늘(미국 서부 날짜) 남은 시간 동안 관심 목록 감시에 들 할당량 어림 */
async function watchedNeedForRestOfDay(): Promise<number> {
  const watched = await prisma.channel.count({ where: { isActive: true, platform: 'YOUTUBE', folder: { watched: true } } }).catch(() => 0);
  const ptHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const hoursLeft = Math.max(1, 24 - ptHour);
  return Math.round((watched * UNITS_PER_WATCHED_CHANNEL * hoursLeft) / 24);
}

/* ───────────── 6. 과거 트래픽 ───────────── */

/** 마지막 업로드가 이만큼 지나면 끊긴 채널 */
export const DEAD_DAYS = 30;
/** 업로드는 끊겼어도 하루 조회가 이만큼 나오면 남긴다 */
export const KEEP_DAILY_VIEWS = 100_000;
/** 과거 트래픽으로 남기는 영상 기준 */
export const HIT_VIEWS = 1_000_000;
/**
 * 과거 트래픽에 하루 쓸 몫 — 키 한도 합의 90% 에서 감시 몫(관심 목록 + 나머지 전체)과 남겨 둘 몫을 뺀 것.
 * 감시가 먼저라, 키가 모자라면 과거 트래픽 정리는 쉬었다가 키가 늘면 돈다. 그래도 하루 1,000 은 쓴다.
 */
function archiveDailyCap(plan: MonitorPlan): number {
  return Math.max(1000, Math.floor(plan.limit * 0.9 - plan.need - RESERVE_UNITS));
}

async function stepArchive(
  report: Pick<CollectReport, 'archivedChannels' | 'pastHits'>,
  canSpend: (u: number) => boolean,
  spend: (u: number) => void,
  plan: MonitorPlan
) {
  const day = kstToday().toISOString().slice(0, 10);
  const mark = await prisma.trendCache.findUnique({ where: { key: 'radar:archive-day' } }).catch(() => null);
  const prev = mark?.payload as { day?: string; units?: number } | null;
  let used = prev?.day === day ? prev.units ?? 0 : 0;
  const cap = archiveDailyCap(plan);
  if (used >= cap) return;
  const use = (u: number) => {
    spend(u);
    used += u;
  };
  const room = (u: number) => used + u <= cap && canSpend(u);

  try {
    const dead = await prisma.channel.findMany({
      where: {
        platform: 'YOUTUBE',
        kind: 'REFERENCE',
        externalId: { startsWith: 'UC' },
        lastUploadAt: { lt: new Date(Date.now() - DEAD_DAYS * 24 * H) },
        OR: [{ dailyViews: null }, { dailyViews: { lt: KEEP_DAILY_VIEWS } }],
      },
      select: {
        id: true,
        externalId: true,
        displayName: true,
        thumbnailUrl: true,
        subscriberCount: true,
        contentFormat: true,
        lastUploadAt: true,
        folder: { select: { name: true } },
      },
      // 큰 채널부터 — 100만+ 영상이 있을 가능성이 높다
      orderBy: { subscriberCount: { sort: 'desc', nulls: 'last' } },
      take: 50,
    });
    if (!dead.length || !room(1)) return;
    const stats = await fetchChannelStats(dead.map((d) => d.externalId));
    use(1);
    const statBy = new Map(stats.map((st) => [st.id, st]));

    for (const ch of dead) {
      const st = statBy.get(ch.externalId);
      const hits: YtVideo[] = [];
      // 총 조회가 100만도 안 되면 100만 영상이 있을 수 없다 — 바로 보관
      if (st?.viewCount != null && st.viewCount >= BigInt(HIT_VIEWS)) {
        // 쇼츠 채널은 인기 쇼츠만, 롱폼 채널은 인기 영상만, 섞인 채널은 둘 다
        const lists = ch.contentFormat === 'shorts' ? ['UUPS'] : ch.contentFormat === 'long' ? ['UULP'] : ['UUPS', 'UULP'];
        for (const pre of lists) {
          let token: string | undefined;
          for (let page = 0; page < 4; page++) {
            if (!room(2)) return;
            const { ids, next } = await fetchPlaylistPage(pre + ch.externalId.slice(2), token);
            use(1);
            if (!ids.length) break;
            const vids = await fetchVideos(ids);
            use(Math.ceil(ids.length / 50));
            const big = vids.filter((v) => v.views >= HIT_VIEWS);
            hits.push(...big.map((v) => (pre === 'UUPS' ? { ...v, isShorts: true } : v)));
            // 조회순이라 100만 아래가 나오면 뒤는 볼 필요 없다
            if (big.length < vids.length || !next) break;
            token = next;
          }
        }
      }
      const unique = [...new Map(hits.map((v) => [v.id, v])).values()];
      await prisma.$transaction([
        prisma.pastHit.createMany({
          data: unique.map((v) => ({
            id: v.id,
            channelExternalId: ch.externalId,
            channelName: st?.title ?? ch.displayName,
            channelThumb: st?.thumbnailUrl ?? ch.thumbnailUrl,
            folder: ch.folder.name,
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            publishedAt: v.publishedAt,
            durationSec: v.durationSec,
            isShorts: v.isShorts,
            views: v.views,
            likes: v.likes,
            comments: v.comments,
            tags: v.tags,
          })),
          skipDuplicates: true,
        }),
        prisma.archivedChannel.upsert({
          where: { externalId: ch.externalId },
          create: {
            externalId: ch.externalId,
            name: st?.title ?? ch.displayName,
            thumbnailUrl: st?.thumbnailUrl ?? ch.thumbnailUrl,
            folder: ch.folder.name,
            subscriberCount: st?.subscriberCount ?? ch.subscriberCount,
            totalViewCount: st?.viewCount ?? null,
            lastUploadAt: ch.lastUploadAt,
            hits: unique.length,
          },
          update: { hits: unique.length, archivedAt: new Date(), folder: ch.folder.name },
        }),
        prisma.channel.delete({ where: { id: ch.id } }),
      ]);
      report.archivedChannels += 1;
      report.pastHits += unique.length;
    }
  } finally {
    await prisma.trendCache
      .upsert({
        where: { key: 'radar:archive-day' },
        create: { key: 'radar:archive-day', payload: { day, units: used } },
        update: { payload: { day, units: used }, fetchedAt: new Date() },
      })
      .catch(() => {});
  }
}

export const _test = { gainOver, kstToday };
