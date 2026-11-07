/**
 * 탭별 AI 분석 — 막 뜨는 작품·연관 꿀통 · 터진 영상(데일리·팬튜브·코미디·쇼핑 등) · 인물선점 · 황금키워드 · 진입 성적표.
 *
 * 탭마다 그 화면 데이터(서버에서 다시 모은다 — 화면이 보낸 값은 범위만 쓴다)를 Claude 에 주고,
 * 같은 모양(판정 · 근거 · 만드는 법 · 제목 예시 · 이어서 볼 것 · 주의)으로 받아 한 화면 부품(AiInsight)으로 보여 준다.
 * 결과는 탭·범위마다 TrendCache 에 남겨 다시 열면 바로 보인다. 새로 분석할 때만 Claude 비용이 든다.
 */

import { prisma } from '@/lib/db';
import { askClaude, extractJson, hasClaudeKey, NoClaudeKeyError, type ClaudeUsage } from './claude';
import { googleNews, similarWorks } from './brief';
import { getHotVideos, type HotWindow } from './queries';
import { getEntries, getGolden, getPersons } from './tabs';
import { getRadarData, type WorksPeriod } from './works';
import { getPlaybook, PLAYBOOK_RULES } from './playbook';
import { CATEGORIES, CATEGORY_LABEL, isHoneyPot, type WorkCategory } from './types';

const H = 3_600_000;

export type InsightKind = 'rising' | 'hot' | 'person' | 'golden' | 'entry';

export type InsightParams = {
  /** rising: 기간 · 분류 */
  period?: WorksPeriod;
  cats?: WorkCategory[];
  /** hot: 화면 이름 · 형식 · 시간 · 채널팩 */
  preset?: string;
  title?: string;
  format?: 'shorts' | 'long';
  window?: HotWindow;
  folders?: string[];
};

export type InsightItem = {
  /** 입력의 ref (작품 key 등) — 화면에서 그 카드에 붙일 때 */
  ref: string;
  name: string;
  verdict: string;
  tone: 'go' | 'watch' | 'avoid';
  why: string;
  how: string;
  titles: string[];
  picks: { title: string; reason: string }[];
  caution: string;
};
export type InsightResult = { headline: string; todo: string[]; sections: { title: string; items: InsightItem[] }[] };
export type Insight = {
  kind: InsightKind;
  scope: string;
  scopeLabel: string;
  result: InsightResult;
  generatedAt: string;
  model: string;
  usage: ClaudeUsage;
  costKrw: number;
};

/* ───────────── 범위 (캐시 키) ───────────── */

const PERIODS: WorksPeriod[] = ['24h', '3d', '7d'];
const WINDOWS: HotWindow[] = [1, 3, 6, 12, 24];

/** 화면이 보낸 값을 허용된 값만 남겨 정리 */
export function cleanParams(kind: InsightKind, p: InsightParams): InsightParams {
  if (kind === 'rising') {
    const cats = (p.cats ?? []).filter((c) => CATEGORIES.includes(c));
    return { period: PERIODS.includes(p.period!) ? p.period : '3d', cats: cats.length ? [...new Set(cats)].sort() : undefined };
  }
  if (kind === 'hot') {
    return {
      preset: (p.preset ?? 'hot').replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'hot',
      title: (p.title ?? '터진 영상').slice(0, 40),
      format: p.format === 'long' ? 'long' : 'shorts',
      window: WINDOWS.includes(p.window!) ? p.window : 24,
      folders: p.folders?.length ? p.folders.map((f) => f.slice(0, 60)).slice(0, 10) : undefined,
    };
  }
  return {};
}

export function scopeOf(kind: InsightKind, p: InsightParams): { scope: string; label: string } {
  if (kind === 'rising') {
    const cats = p.cats?.length ? p.cats.join(',') : 'all';
    const catLabel = p.cats?.length ? p.cats.map((c) => CATEGORY_LABEL[c]).join('·') : '전체';
    return { scope: `${p.period}:${cats}`, label: `최근 ${p.period === '24h' ? '24시간' : p.period === '7d' ? '7일' : '3일'} · ${catLabel}` };
  }
  if (kind === 'hot') return { scope: `${p.preset}:${p.format}:${p.window}`, label: `${p.title} · ${p.format === 'long' ? '롱폼' : '쇼츠'} ${p.window}시간` };
  return { scope: 'all', label: '' };
}

const cacheKey = (kind: InsightKind, scope: string) => `radar:insight:${kind}:${scope}`;

/* ───────────── 자료 모으기 ───────────── */

const kst = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 9 * H).toISOString().slice(0, 10) : null);
const ageH = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / H);

async function risingInput(p: InsightParams) {
  const data = await getRadarData(p.period ?? '3d');
  const inCat = (c: WorkCategory) => !p.cats?.length || p.cats.includes(c);
  const rising = data.rising.filter((w) => inCat(w.category)).slice(0, 10);
  if (!rising.length) throw new Error('이 범위에 뜨는 작품이 아직 없습니다');
  const since = new Date(Date.now() - ({ '24h': 24, '3d': 72, '7d': 168 }[p.period ?? '3d'] ?? 72) * H);
  const ids = rising.map((w) => w.key);
  const [clips, meta] = await Promise.all([
    prisma.$queryRaw<{ workId: string; title: string; views: number; channel: string; layout: string | null; dur: number | null }[]>`
      SELECT "workId", title, views, channel, layout, dur FROM (
        SELECT v."workId", v.title, v.views, COALESCE(c."displayName", c."externalId") AS channel, c.layout, v."durationSec" AS dur,
          ROW_NUMBER() OVER (PARTITION BY v."workId" ORDER BY v.views DESC) AS rn
        FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
        WHERE v."workId" = ANY(${ids}::text[]) AND v."publishedAt" > ${since}
      ) t WHERE rn <= 8`,
    prisma.radarWork.findMany({
      where: { id: { in: ids } },
      select: { id: true, tmdbId: true, mediaType: true, firstAirDate: true, lastEpisodeAt: true, nextEpisodeAt: true },
    }),
  ]);
  const metaBy = new Map(meta.map((m) => [m.id, m]));
  const top5 = rising.slice(0, 5);
  const [news, similar] = await Promise.all([
    Promise.all(top5.map((w) => googleNews(w.title.split(':')[0], 4))),
    Promise.all(top5.map((w) => (metaBy.get(w.key) ? similarWorks(metaBy.get(w.key)!.mediaType, metaBy.get(w.key)!.tmdbId) : Promise.resolve([])))),
  ]);
  return {
    period: p.period,
    works: rising.map((w, i) => ({
      ref: w.key,
      title: w.title,
      year: w.year,
      category: CATEGORY_LABEL[w.category],
      onAir: !!w.onAir,
      networks: w.tags.slice(0, 3),
      cast: w.cast.slice(0, 4),
      firstAir: kst(metaBy.get(w.key)?.firstAirDate),
      lastEpisode: kst(metaBy.get(w.key)?.lastEpisodeAt),
      nextEpisode: kst(metaBy.get(w.key)?.nextEpisodeAt),
      recentShorts: w.recentShorts,
      recentViews: w.recentViews,
      maxViews: w.maxViews,
      channels: w.channels,
      spike: w.spike,
      // layout = 그 채널의 화면 구성(썸네일 분류), sec = 영상 길이
      topClips: clips.filter((c) => c.workId === w.key).map((c) => ({ title: c.title.slice(0, 90), views: c.views, channel: c.channel, layout: c.layout, sec: c.dur })),
      related: w.related.slice(0, 8).map((r) => ({
        title: r.title,
        year: r.year,
        via: r.via.slice(0, 2),
        maxViews: r.maxViews,
        millionCount: r.millionCount,
        channels: r.channels,
        honeyPot: isHoneyPot(r),
      })),
      unmeasured: w.unmeasured.slice(0, 5).map((u) => `${u.title}${u.year ? `(${u.year})` : ''}`),
      news: i < 5 ? news[i].map((n) => `${n.title} — ${n.source}`) : [],
      similar: i < 5 ? similar[i].slice(0, 6).map((s) => `${s.title}${s.year ? `(${s.year})` : ''}`) : [],
      // 구성 차별화 근거: 이 작품 영상의 59초 이하 vs 미드폼(1~3분) 조회 중앙값
      format: w.format,
      // 인물 핀셋: 출연자 이름이 제목·태그에 나온 영상 수 · 조회 중앙값
      pinset: w.pinset,
    })),
    // 부활 후보: 최근 한 달 안에 크게 터졌는데 지금 10일 동안 거의 아무도 안 하는 작품
    revival: (await getPlaybook().catch(() => null))?.revival
      .filter((r) => !p.cats?.length || p.cats.includes(r.category as WorkCategory))
      .slice(0, 10)
      .map((r) => ({ title: r.title, year: r.year, category: r.categoryLabel, pastMax: r.pastMax, past300k: r.past300k, pastChannels: r.pastChannels, recentChannels: r.recentChannels, topClip: r.top?.title.slice(0, 80) ?? null })) ?? [],
    crowded: data.crowded.filter((w) => inCat(w.category)).slice(0, 8).map((w) => ({
      ref: w.key,
      title: w.title,
      channels: w.channels,
      recentShorts: w.recentShorts,
      avgViews: Math.round(w.avgViews),
      trendPct: Math.round(w.trend),
    })),
  };
}

async function hotInput(p: InsightParams) {
  const r = await getHotVideos({ format: p.format ?? 'shorts', window: p.window ?? 24, sort: 'rising', excludeWhale: false, folders: p.folders });
  if (!r.items.length) throw new Error('이 범위에 터진 영상이 아직 없습니다');
  return {
    screen: p.title,
    format: p.format,
    windowHours: p.window,
    videos: r.items.slice(0, 40).map((v) => ({
      title: v.title.slice(0, 100),
      views: v.views,
      gain: v.gain,
      perHour: v.perHour,
      multipleOfChannelUsual: v.multiple != null ? Math.round(v.multiple * 10) / 10 : null,
      channel: v.channelName,
      pack: v.folder,
      work: v.work,
      hoursSinceUpload: ageH(v.publishedAt),
    })),
  };
}

async function personInput() {
  const rows = (await getPersons()).slice(0, 18);
  if (!rows.length) throw new Error('최근 7일 출연작 쇼츠가 있는 인물이 아직 없습니다');
  const news = await Promise.all(rows.slice(0, 8).map((p) => googleNews(p.name, 4)));
  return {
    persons: rows.map((p, i) => ({
      ref: String(p.id),
      name: p.name,
      views7d: p.recentViews,
      viewsPrev7d: p.prevViews,
      shorts7d: p.recentShorts,
      growthPct: p.growth,
      works: p.works.map((w) => `${w.title}(${w.views.toLocaleString()})`),
      openWorks: p.open.map((o) => `${o.title}${o.year ? `(${o.year})` : ''}`),
      news: i < 8 ? news[i].map((n) => `${n.title} — ${n.source}`) : [],
    })),
  };
}

async function goldenInput() {
  const d = await getGolden();
  const rows = d.rows.filter((r) => r.volume != null).slice(0, 40);
  if (!rows.length) throw new Error(d.enabled ? '검색수가 잡힌 키워드가 아직 없습니다' : '네이버 검색광고 키가 없어 검색수를 못 가져왔습니다 (설정 → API 키)');
  return { keywords: rows.map((r) => ({ ref: r.kind + ':' + r.keyword, keyword: r.keyword, kind: r.kind === 'work' ? '작품' : '배우', monthlySearch: r.volume, shorts7d: r.shorts7d, channels7d: r.channels7d, score: r.score })) };
}

async function entryInput() {
  const rows = (await getEntries()).slice(0, 25);
  if (!rows.length) throw new Error('최근 14일 새로 다뤄지기 시작한 작품이 아직 없습니다');
  return {
    works: rows.map((r) => ({
      ref: r.work.id,
      title: r.work.title,
      category: CATEGORY_LABEL[r.work.category],
      onAir: r.work.onAir,
      daysSinceFirstShort: Math.round(ageH(r.firstAt) / 24),
      shorts: r.shorts,
      channels: r.channels,
      medianViews: r.medianViews,
      maxViews: r.maxViews,
      multipleOfChannelUsual: r.multiple != null ? Math.round(r.multiple * 10) / 10 : null,
      ruleVerdict: r.verdict,
      topClips: r.top.map((v) => `${v.title.slice(0, 80)} (${v.views.toLocaleString()}회 · ${v.channel})`),
    })),
  };
}

/* ───────────── 지시 ───────────── */

const BASE = `너는 한국 유튜브 쇼츠 채널 운영자를 돕는 분석가다. 운영자는 드라마·영화·예능 클립, 연예 이슈, 시니어 타깃 쇼츠를 만든다.
자료는 운영자가 감시하는 경쟁 채널 수만 곳의 실제 수치다 (views=조회수, channels=그 소재를 다룬 감시 채널 수 = 경쟁).
규칙:
- 근거는 자료의 수치·영상 제목·기사 제목을 인용한다 (예: "쇼츠 12편 · 채널 3곳 · 최고 180만"). 자료에 없는 사건·수치를 지어내지 않는다. 기사로 확인이 필요하면 그렇게 쓴다.
- 작품은 실제로 있는 것만. 결이 비슷한 작품은 자료의 similar·related 를 우선 쓴다.
- "how" 는 오늘 바로 만들 수 있게 구체적으로: 어떤 장면·소재·포맷·길이·첫 2초 훅.
- "titles" 는 실제 올릴 쇼츠 제목 예시 2~3개 — 잘 나온 영상 제목의 말투·구조를 참고하되 베끼지 않는다.
- 추모·사망, 정치, 범죄·논란, 미성년자는 caution 에 자극 표현을 피하라고 적는다. 남의 영상을 쓰는 소재는 저작권 주의를 적는다.
- tone: go(지금 만들 것) · watch(지켜볼 것·조건부) · avoid(피할 것). verdict 는 6자 안팎 한국어 판정.
- 모든 글은 한국어, 짧고 단정하게. 한 항목의 why·how 는 각각 2문장 이내.
${PLAYBOOK_RULES}
- 그래서 go 항목의 how 에는 늘 ① 무엇의 형식·구성을 가져오고(잘 나온 영상·채널) ② 무엇 하나를 바꿀지(차별화)를 쓴다. why 에는 진입 근거 수치와 경쟁 강도(채널·영상 수)를 쓴다.
출력: JSON 객체 하나만 (코드 블록·설명 없이 { 로 시작해 } 로 끝낸다). 빠진 값은 빈 문자열·빈 배열.
{"headline":"한 줄 요약","todo":["오늘 할 일 순서대로 3~5개"],"sections":[{"title":"섹션 이름","items":[{"ref":"자료의 ref 그대로 (없으면 빈 문자열)","name":"","verdict":"","tone":"go|watch|avoid","why":"","how":"","titles":["",""],"picks":[{"title":"","reason":""}],"caution":""}]}]}`;

const TASK: Record<InsightKind, string> = {
  rising: `화면: 「막 뜨는 작품 · 연관 꿀통」. 자료: 기간 안에 감시 채널에서 조회가 튄 작품(works — 상위 쇼츠 제목, 출연진, 첫 방송·최근 회차·다음 회차 날짜(방영 중이면 다음 회차 전에 올릴 것을 how 에), 연관작 related(honeyPot=조회 30만+ · 채널 2곳 이하), 출연진의 아직 아무도 안 만든 작품 unmeasured, 최근 기사 news, TMDB 비슷한 작품 similar)과 여러 채널이 몰린 작품(crowded).
섹션 3개를 이 순서·이름으로:
1) "지금 탈 작품" — works 각각 (최대 8개). spike=true(쇼츠 1편·채널 1곳만 터짐)면 반짝일 수 있다고 watch. 채널이 많고 평균이 떨어지면 watch/avoid. how 는 상위 쇼츠 제목에서 먹힌 장면·소재와 topClips 의 layout(화면 구성: insta 인스타형(흰 배경 캡션) · titlebar 일반형(검은 제목바) · full 풀화면 · split 위아래 분할 등, 아직 분류 안 됐으면 null)·sec(길이)으로 먹힌 형식을 짚고, 차별화 하나를 고른다 (잘 나온 영상들이 다 같은 구성이면 다른 구성으로 바꾸는 것도 차별화):
   - 채널이 많으면(경쟁 셈) pinset 에서 영상은 적은데 조회 중앙값이 좋은 출연자 한 명을 핀셋으로 (예: "OOO 한 명만 — 영상 3편뿐인데 중앙값 40만").
   - format 에서 미드폼(mid) 중앙값이 59초 이하(short)보다 1.5배 넘게 높으면 미드폼(1~3분)을 권한다 (표본 수도 같이).
   picks 에는 이 작품을 타고 이어서 만들 작품 2~4개 — related 중 honeyPot 우선, unmeasured(빈자리), similar(결 맞는 작품) 순으로 이유와 함께.
2) "연관 꿀통 · 빈자리" — 모든 works 의 related(honeyPot)·unmeasured 중 지금 만들 가치가 큰 것 최대 6개. name=작품 이름, ref=빈 문자열, why 에 어느 뜨는 작품의 누구 출연이라 이어지는지와 수치.
3) "피할 작품" — crowded 중 피할 것 (tone avoid, ref=crowded 의 ref). 채널 수·평균 조회·추세를 근거로.
4) "부활 작품" — revival(최근 한 달 안에 30만+ 영상이 여러 채널에서 나왔는데 지금 10일 동안 거의 아무도 안 하는 작품) 중 지금 다시 들어갈 만한 것 최대 5개. ref=빈 문자열. why 에 그때 수치(pastMax · past300k · pastChannels)와 지금 경쟁(recentChannels). 작품명이 일반 단어라 잘못 묶인 것 같으면 빼거나 caution 에. how 에 어떤 장면·구성으로 (미드폼·하이브리드 내레이션 등).`,
  hot: `화면: 터진 영상 목록 (screen 이름의 묶음). 자료: 고른 시간 동안 조회가 가장 많이 늘어난 영상(gain=그 시간 증가, multipleOfChannelUsual=채널 평소의 몇 배, work=붙은 작품).
섹션 3개를 이 순서·이름으로:
1) "터진 이유 · 패턴" — 제목·소재·포맷에서 반복되는 패턴 3~5개. name=패턴 이름, why=그 패턴의 영상 예(제목 일부와 수치), how=따라 만드는 법, titles=그 패턴을 적용한 새 제목 예시. ref=빈 문자열.
2) "지금 만들 소재" — 지금 올라타면 좋을 구체적 소재(작품·인물·사건·상품·장소) 3~6개. 이미 여러 채널이 같은 걸 올렸으면 watch. 쇼핑 화면이면 뜨는 상품, 여행 화면이면 뜨는 숙소·여행지를 소재로.
3) "주의" — 따라 하면 안 되는 것 (저작권·자극·반짝 소재) 0~3개, tone avoid.`,
  person: `화면: 「인물선점」. 자료: 출연작 쇼츠 조회가 최근 7일 늘어난 배우(views7d·viewsPrev7d·growthPct, 출연작별 조회 works, 감시 채널에 쇼츠가 아직 없는 출연작 openWorks, 최근 기사 news).
섹션 2개를 이 순서·이름으로:
1) "선점할 인물" — 지금 이 사람으로 쇼츠를 만들면 좋을 인물 최대 6명 (ref=자료의 ref). why=왜 뜨나(수치 + 기사), picks=만들 작품 (openWorks 의 빈자리 우선, 그다음 덜 다룬 출연작), how=어떤 장면·주제로, titles=제목 예시.
2) "지켜볼 인물" — 조회는 늘지만 근거가 약하거나(한 작품만 · 동명이인 의심) 이미 붐빈 인물 최대 5명, tone watch 또는 avoid.`,
  golden: `화면: 「황금키워드」. 자료: 네이버 월 검색수(monthlySearch)는 많은데 감시 채널 최근 7일 쇼츠(shorts7d)는 적은 작품·배우 키워드 (score=검색수÷(쇼츠+1)).
섹션 2개를 이 순서·이름으로:
1) "지금 만들 키워드" — 검색 수요가 진짜 이 작품·배우 때문이고 쇼츠로 만들 거리가 있는 것 최대 8개 (ref=자료의 ref). how=어떤 쇼츠로(검색하는 사람이 궁금한 것 — 결말·출연진·실화 여부·명장면 등), titles=검색어가 들어간 제목 예시.
2) "검색수 착시" — 일반 단어·동명이인·다른 뜻 때문에 검색수가 부풀었거나 쇼츠로 만들 거리가 없는 키워드 최대 6개, tone avoid, why 에 이유.`,
  entry: `화면: 「진입 성적표」. 자료: 최근 14일 안에 감시 채널에서 처음 다뤄지기 시작한 작품과 첫 쇼츠 성적(medianViews, multipleOfChannelUsual=채널 평소의 몇 배, ruleVerdict=규칙 판정 go/ok/weak, 상위 쇼츠 topClips).
섹션 3개를 이 순서·이름으로 (ref=자료의 ref):
1) "지금 들어갈 작품" — 첫 성적이 좋고 아직 채널이 적어 들어갈 만한 것 최대 6개. how 는 topClips 에서 먹힌 장면·포맷.
2) "지켜볼 작품" — 성적이 애매하거나 표본이 적은 것 최대 5개, watch, 무엇을 보고 정할지 why 에.
3) "들어가지 말 것" — 첫 성적이 약하거나 이미 붐빈 것 최대 5개, avoid.`,
};

const EFFORT: Record<InsightKind, 'low' | 'medium'> = { rising: 'medium', hot: 'low', person: 'medium', golden: 'low', entry: 'low' };

/* ───────────── 읽기 ───────────── */

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v : []);

export function parseInsight(text: string): InsightResult | null {
  const j = extractJson(text) as any;
  if (!j || typeof j !== 'object') return null;
  const sections = list(j.sections)
    .filter((x: any) => x && typeof x === 'object')
    .map((x: any) => ({
      title: s(x.title),
      items: list(x.items)
        .filter((i: any) => i && typeof i === 'object' && s(i.name))
        .map(
          (i: any): InsightItem => ({
            ref: s(i.ref),
            name: s(i.name),
            verdict: s(i.verdict),
            tone: i.tone === 'go' || i.tone === 'avoid' ? i.tone : 'watch',
            why: s(i.why),
            how: s(i.how),
            titles: list(i.titles).map(s).filter(Boolean).slice(0, 4),
            picks: list(i.picks)
              .filter((p: any) => p && s(p.title))
              .map((p: any) => ({ title: s(p.title), reason: s(p.reason) }))
              .slice(0, 5),
            caution: s(i.caution),
          })
        ),
    }))
    .filter((x) => x.title && x.items.length);
  if (!sections.length && !s(j.headline)) return null;
  return { headline: s(j.headline), todo: list(j.todo).map(s).filter(Boolean).slice(0, 6), sections };
}

/* ───────────── 공개 함수 ───────────── */

export async function lastInsight(kind: InsightKind, raw: InsightParams): Promise<{ insight: Insight | null; hasKey: boolean; scopeLabel: string }> {
  const p = cleanParams(kind, raw);
  const { scope, label } = scopeOf(kind, p);
  const [row, key] = await Promise.all([prisma.trendCache.findUnique({ where: { key: cacheKey(kind, scope) } }).catch(() => null), hasClaudeKey()]);
  return { insight: (row?.payload as unknown as Insight) ?? null, hasKey: key, scopeLabel: label };
}

export async function generateInsight(kind: InsightKind, raw: InsightParams): Promise<Insight> {
  if (!(await hasClaudeKey())) throw new NoClaudeKeyError();
  const p = cleanParams(kind, raw);
  const { scope, label } = scopeOf(kind, p);
  const input =
    kind === 'rising' ? await risingInput(p) : kind === 'hot' ? await hotInput(p) : kind === 'person' ? await personInput() : kind === 'golden' ? await goldenInput() : await entryInput();
  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const r = await askClaude({
    system: BASE,
    user: `오늘은 ${today}이다.\n${TASK[kind]}\n\n<자료>\n${JSON.stringify(input)}\n</자료>`,
    maxTokens: 24000,
    timeoutMs: 270_000,
    effort: EFFORT[kind],
  });
  const result = parseInsight(r.text);
  if (!result) throw new Error('Claude 응답을 읽지 못했습니다 — 다시 시도해 주세요');
  const insight: Insight = { kind, scope, scopeLabel: label, result, generatedAt: new Date().toISOString(), model: r.model, usage: r.usage, costKrw: r.costKrw };
  const key = cacheKey(kind, scope);
  await prisma.trendCache.upsert({ where: { key }, create: { key, payload: insight as object }, update: { payload: insight as object, fetchedAt: new Date() } });
  return insight;
}

/** 쿼리스트링 → 종류·범위 */
export function parseInsightQuery(sp: URLSearchParams): { kind: InsightKind; params: InsightParams } | null {
  const kind = sp.get('kind') as InsightKind;
  if (!['rising', 'hot', 'person', 'golden', 'entry'].includes(kind)) return null;
  const csv = (k: string) => (sp.get(k) ? sp.get(k)!.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
  return {
    kind,
    params: {
      period: (sp.get('period') as WorksPeriod) ?? undefined,
      cats: csv('cats') as WorkCategory[] | undefined,
      preset: sp.get('preset') ?? undefined,
      title: sp.get('title') ?? undefined,
      format: (sp.get('format') as 'shorts' | 'long') ?? undefined,
      window: sp.get('window') ? (Number(sp.get('window')) as HotWindow) : undefined,
      folders: csv('folders'),
    },
  };
}
