/**
 * 작품 인식 — 영상 제목·해시태그·태그에서 작품 이름 후보를 뽑아 TMDB 에서 찾는다.
 *
 *  - 후보: #해시태그, 「」『』[]<>《》'' 안의 말, 영상 태그
 *  - 후보는 공백·기호를 빼고 소문자로 맞춰(RadarAlias) 한 번 물어본 건 다시 묻지 않는다
 *  - TMDB 제목(한국어·원제) 또는 부제를 뗀 앞 제목("닥터X: 하얀 마피아의 시대" → "닥터X")과 정확히 같을 때만 작품으로 본다
 *    같은 이름이 여럿이면 한국 작품 → 인기순
 *  - 영상 제목 안에 알려진 작품 제목(방영 중·최근 작품 등)이 그대로 들어 있으면 그것도 근거로 본다
 *  - 믿을 만한 근거만 쓴다 (엉뚱한 작품이 붙는 걸 막으려고):
 *      제목 해시태그·괄호 > 영상 태그(작품명이 제목에도 있거나 "작품명 몰아보기/결말" 꼴일 때만)
 *      세 글자 이하 작품명(레이·메이 같은 이름과 겹침)은 드라마·영화·예능 채널의 제목 해시태그로만
 *      게임·스포츠·쇼핑처럼 작품과 상관없는 채널팩은 아예 찾지 않는다
 *  - 한 영상에 작품 후보가 여럿이면 근거 점수가 높은 작품 (같으면 인기순)
 *  - 작품 상세(장르·방송사·방영 중·출연진)와 출연자의 다른 출연작은 따로 받아 둔다
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { categoryOf, tmdb } from './tmdb';

const H = 3_600_000;

/** 작품 이름이 아닌 흔한 말 */
const STOP = new Set(
  [
    'shorts', 'short', '쇼츠', 'youtubeshorts', 'fyp', 'viral', 'trending', 'funny', 'kdrama', 'kmovie', 'movie', 'movies', 'drama',
    '드라마', '영화', '예능', '명장면', '레전드', '추천', '리뷰', '결말', '해석', '요약', '몰아보기', '하이라이트', '줄거리', '스포', '스포주의',
    '영화추천', '드라마추천', '영화리뷰', '드라마리뷰', '예능추천', '한국드라마', '한국영화', '미드', '미국드라마', '중드', '일드', '애니',
    '넷플릭스', 'netflix', '티빙', 'tving', '쿠팡플레이', '디즈니플러스', 'disneyplus', '웨이브', 'wavve', '왓챠', 'watcha', '왓챠피디아',
    'sbs', 'kbs', 'kbs2', 'mbc', 'jtbc', 'tvn', 'ena', 'mbn', 'tv조선', '채널a', 'mnet', 'ocn', 'tvchosun',
    '웃긴영상', '웃긴', '감동', '반전', '소름', '눈물', '사이다', '참교육', '복수', '로맨스', '코미디', '스릴러', '액션', '공포', '범죄',
    '연예', '연예인', '배우', '아이돌', '케이팝', 'kpop', '먹방', '브이로그', 'vlog', '밈', 'meme', '꿀잼', '노잼', 'ㅋㅋ', 'ㅋㅋㅋ',
    '오늘의드라마', '오늘의영화', '실화', '역대급', '충격', '최신', '신작', '1화', '2화', '최종화', '마지막화',
    // 숏드라마·클립 채널이 영상마다 붙이는 영어 말 (같은 이름의 해외 작품으로 잘못 붙는다)
    'love', 'ceo', 'series', 'romance', 'revenge', 'family', 'koreandrama', 'koreanshortdrama', 'shortdrama', 'chinesedrama',
    'cdrama', 'jdrama', 'film', 'tv', 'show', 'story', 'life', 'happy', 'sad', 'cute', 'baby', 'wedding', 'marriage', 'boss',
  ].map((w) => normalizeAlias(w))
);

export function normalizeAlias(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

export type Candidate = {
  text: string;
  /** 제목의 해시태그·괄호에서 나온 것 (영상 태그보다 믿을 만하다) */
  strong: boolean;
  /** "작품명 몰아보기/결말/명장면" 꼴에서 떼어 낸 작품명 — 영상 태그여도 작품 얘기라는 근거 */
  review?: boolean;
};

/** 부제를 뗀 앞 제목 ("닥터X: 하얀 마피아의 시대" → "닥터X") */
export function mainTitle(t: string): string {
  return t.split(/\s*[:：]\s*|\s+[-–—]\s+/)[0].trim();
}

/**
 * 영상 하나에서 작품 이름 후보 (원래 글자 그대로 — TMDB 에 그대로 물어본다).
 * 제목 해시태그·괄호와 설명란 단서(해시태그·출처·괄호)는 믿을 만한 근거, 영상 태그는 약한 근거.
 */
export function candidatesOf(title: string, tags: string[], descTags: string[] = []): Candidate[] {
  const raw: Candidate[] = [];
  for (const m of title.matchAll(/#([^\s#]+)/g)) raw.push({ text: m[1], strong: true });
  for (const m of title.matchAll(/[「『\[〈<《'"“‘]([^」』\]〉>》'"”’]{2,30})[」』\]〉>》'"”’]/g)) raw.push({ text: m[1], strong: true });
  for (const t of descTags) raw.push({ text: t, strong: true });
  for (const t of tags) raw.push({ text: t, strong: false });
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const { text: r, strong } of raw) {
    const t = r.replace(/^#/, '').trim();
    const n = normalizeAlias(t);
    // 숫자만, "3화", 채널이 붙이는 관리 코드(#260809cyA3)는 작품 이름이 아니다
    if (n.length < 2 || n.length > 30 || /^\d+$/.test(n) || /^\d+(화|회|부|편|탄)$/.test(n) || /^\d{4,}[a-z]{1,4}\d*$/.test(n) || STOP.has(n) || seen.has(n)) continue;
    // "드라마제목 3화", "시즌2" 같은 꼬리는 떼고 한 번 더
    seen.add(n);
    out.push({ text: t, strong });
    // "드라마제목 3화", "제목 시즌2", "제목2", "제목 몰아보기" 같은 꼬리를 떼고 한 번 더
    const noReview = t.replace(/\s*(몰아보기|결말포함|결말|명장면|하이라이트|리뷰|요약|레전드|모음|다시보기|통합본|풀버전|full)+$/i, '');
    const review = noReview !== t;
    const trimmed = noReview
      .replace(/\s*(시즌\s*\d+|\d+\s*화|\d+\s*회|ep\.?\s*\d+|e\d+|season\s*\d+)$/i, '')
      .replace(/(?<=[가-힣a-z])\s*\d{1,2}$/i, '')
      .trim();
    const tn = normalizeAlias(trimmed);
    if (tn !== n && tn.length >= 2 && !STOP.has(tn) && !seen.has(tn)) {
      seen.add(tn);
      out.push({ text: trimmed, strong, review });
    }
  }
  return out.slice(0, 24);
}

type SearchItem = {
  id: number;
  media_type: 'tv' | 'movie' | 'person';
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  original_language?: string;
  origin_country?: string[];
  genre_ids?: number[];
  poster_path?: string | null;
  profile_path?: string | null;
  popularity?: number;
  vote_count?: number;
  first_air_date?: string;
  release_date?: string;
  known_for_department?: string;
};

const isKr = (x: SearchItem) => x.original_language === 'ko' || (x.origin_country ?? []).includes('KR');

/**
 * 후보 하나를 TMDB 에서 찾아 작품·인물로 (정확히 같은 이름만).
 * TMDB 검색은 띄어쓰기 단위로 맞춰서 "#폭싹속았수다" 처럼 붙여 쓴 해시태그는 그대로는 안 나온다
 * — 그럴 땐 앞 두세 글자·뒤 세 글자·앞쪽 영문으로 다시 찾고, 결과 중 공백·기호를 뺀 이름이 같은 걸 고른다.
 */
async function lookup(raw: string, norm: string): Promise<{ work?: SearchItem; person?: SearchItem }> {
  const queries = [raw];
  if (!/\s/.test(raw.trim())) {
    const compact = raw.replace(/[\s\p{P}\p{S}]/gu, '');
    const latin = compact.match(/^[a-z0-9]+/i)?.[0];
    if (latin && latin.length >= 2 && latin.length < compact.length) queries.push(latin);
    if (compact.length >= 4) queries.push(compact.slice(0, 2), compact.slice(0, 3), compact.slice(-3));
  }
  let person: SearchItem | undefined;
  for (const [i, q] of [...new Set(queries)].entries()) {
    const r = await tmdb<{ results?: SearchItem[] }>('/search/multi', { query: q, include_adult: 'false' });
    const results = r.results ?? [];
    const exact = results.filter(
      (x) =>
        (x.media_type === 'tv' || x.media_type === 'movie') &&
        [x.name, x.title, x.original_name, x.original_title].some(
          (t) => t && (normalizeAlias(t) === norm || normalizeAlias(mainTitle(t)) === norm)
        )
    );
    // 두세 글자 이름은 흔해서 어느 정도 알려진 작품만
    const ok = exact.filter((x) => norm.length > 3 || (x.popularity ?? 0) >= 5 || (x.vote_count ?? 0) >= 20);
    if (ok.length) {
      ok.sort((a, b) => Number(isKr(b)) - Number(isKr(a)) || (b.popularity ?? 0) - (a.popularity ?? 0));
      return { work: ok[0] };
    }
    if (i === 0) {
      person = results.find(
        (x) => x.media_type === 'person' && x.name && normalizeAlias(x.name) === norm && (x.known_for_department ?? 'Acting') === 'Acting'
      );
      if (person) return { person };
    }
  }
  return {};
}

function workRow(x: SearchItem) {
  const mediaType = x.media_type as 'tv' | 'movie';
  const date = x.first_air_date || x.release_date || '';
  return {
    id: `${mediaType}:${x.id}`,
    tmdbId: x.id,
    mediaType,
    title: (x.name || x.title || '').trim(),
    originalTitle: x.original_name || x.original_title || null,
    year: date ? date.slice(0, 4) : null,
    category: categoryOf(mediaType, x),
    posterPath: x.poster_path ?? null,
    genres: x.genre_ids ?? [],
    originCountry: x.origin_country ?? [],
    originalLanguage: x.original_language ?? null,
    popularity: x.popularity ?? null,
  };
}

/** n 개씩 동시에 */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/**
 * 후보들을 작품·인물로 바꾼다. 처음 보는 후보만 TMDB 에 묻는다.
 * 작품이 아니었던 후보도 30일 동안은 다시 묻지 않는다.
 */
export async function resolveAliases(raws: string[], deadline: number): Promise<Map<string, { workId: string | null; personId: number | null }>> {
  const byNorm = new Map<string, string>();
  for (const r of raws) {
    const n = normalizeAlias(r);
    if (!byNorm.has(n)) byNorm.set(n, r);
  }
  const norms = [...byNorm.keys()];
  const out = new Map<string, { workId: string | null; personId: number | null }>();
  if (!norms.length) return out;

  const known = await prisma.radarAlias.findMany({ where: { alias: { in: norms } } });
  const stale = Date.now() - 30 * 24 * H;
  for (const a of known) {
    // 막은 별칭은 작품이 아닌 말로
    if (a.blocked) out.set(a.alias, { workId: null, personId: null });
    else if (a.workId || a.personId || a.checkedAt.getTime() > stale) out.set(a.alias, { workId: a.workId, personId: a.personId });
  }
  const todo = norms.filter((n) => !out.has(n));

  await pool(todo, 10, async (norm) => {
    if (Date.now() > deadline) return;
    const raw = byNorm.get(norm)!;
    let res: Awaited<ReturnType<typeof lookup>>;
    try {
      res = await lookup(raw, norm);
    } catch {
      return; // TMDB 오류 — 다음에 다시
    }
    let workId: string | null = null;
    let personId: number | null = null;
    if (res.work) {
      const w = workRow(res.work);
      workId = w.id;
      await prisma.radarWork.upsert({
        where: { id: w.id },
        create: w,
        update: { popularity: w.popularity, posterPath: w.posterPath ?? undefined },
      });
    } else if (res.person) {
      personId = res.person.id;
      await prisma.radarPerson.upsert({
        where: { id: res.person.id },
        create: { id: res.person.id, name: res.person.name ?? raw, profilePath: res.person.profile_path ?? null },
        update: {},
      });
    }
    await prisma.radarAlias.upsert({
      where: { alias: norm },
      create: { alias: norm, workId, personId, source: 'tmdb' },
      update: { workId, personId, checkedAt: new Date(), source: 'tmdb' },
    });
    out.set(norm, { workId, personId });
  });
  return out;
}

/** 작품 얘기가 나오는 채널팩 — 여기서만 작품을 찾는다 (게임·스포츠·쇼핑·요리 등은 건너뜀) */
const WORK_FOLDER_RE = /(영드짜|드짜|드라마|영화|예능|애니|셀럽|팬튜브|연예|스케치|커뮤형|랭킹|넘사|고래|주제 자주 변경|썰|짤|인스타 틱톡 짜집기|해짜|방송사)/;
/** 세 글자 이하 작품명을 믿어도 되는 채널팩 (드라마·영화·예능 클립 채널) */
const DRAMA_FOLDER_RE = /(영드짜|드짜|드라마|영화|예능|애니)/;

type DictWork = { id: string; main: string; full: string; popularity: number };

/**
 * 영상 제목 안에서 찾을 '알려진 작품' — 한국 작품(방영 중·2년 안·인기 10+)과 인기 해외 작품(30+).
 * 앞 제목이 네 글자 이상이거나, 세 글자라도 방영 중·두 달 안에 시작한 작품만 (흔한 말과 겹치지 않게)
 */
async function knownTitles(): Promise<DictWork[]> {
  const rows = await prisma.$queryRaw<{ id: string; title: string; popularity: number | null; recent: boolean }[]>`
    SELECT id, title, popularity, ("onAir" OR "firstAirDate" > NOW() - INTERVAL '60 days') AS recent
    FROM "RadarWork"
    WHERE (category LIKE 'kr_%' AND ("onAir" OR "firstAirDate" > NOW() - INTERVAL '2 years' OR COALESCE(popularity, 0) >= 10))
       OR COALESCE(popularity, 0) >= 30`;
  return rows
    .map((r) => ({ id: r.id, main: normalizeAlias(mainTitle(r.title)), full: normalizeAlias(r.title), popularity: r.popularity ?? 0, recent: r.recent }))
    .filter((w) => w.main.length >= 4 || (w.main.length === 3 && w.recent))
    .map(({ id, main, full, popularity }) => ({ id, main, full, popularity }));
}

/** 이 점수 이상이면 확정 (집계에 씀), 그 아래 1점 이상은 추정 (화면에 '추정'으로만) */
export const CONFIDENT_SCORE = 2;
const GUESS_SCORE = 1;

/** 채널팩과 작품 종류가 안 맞으면 감점 — 아이돌·셀럽 채널의 '영화', 예능 채널의 '영화' */
function compatPenalty(folder: string, category: string): number {
  const movie = category.endsWith('movie');
  if (movie && /(팬튜브|아이돌|셀럽|연예)/.test(folder)) return -1;
  if (movie && /예능/.test(folder)) return -0.5;
  return 0;
}

/** 작품을 아직 안 찾아본 영상에 작품을 붙인다. 붙인 수 */
export async function matchVideos(deadline: number, limit = 400): Promise<{ matched: number; checked: number }> {
  const vids = await prisma.$queryRaw<{ id: string; title: string; tags: string[]; descTags: string[]; folder: string }[]>`
    SELECT v.id, v.title, v.tags, v."descTags", f.name AS folder
    FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId" JOIN "Folder" f ON f.id = c."folderId"
    WHERE v."matchedAt" IS NULL AND NOT v."matchLocked"
    ORDER BY (v."publishedAt" > NOW() - INTERVAL '3 days') DESC, v.views DESC
    LIMIT ${limit}`;
  if (!vids.length) return { matched: 0, checked: 0 };
  const now = new Date();

  // 작품과 상관없는 채널팩은 찾지 않고 끝낸다
  const skip = vids.filter((v) => !WORK_FOLDER_RE.test(v.folder));
  if (skip.length) {
    await prisma.radarVideo.updateMany({
      where: { id: { in: skip.map((v) => v.id) } },
      data: { workId: null, guessWorkId: null, matchScore: null, matchedBy: null, matchedAt: now },
    });
  }
  const todo = vids.filter((v) => WORK_FOLDER_RE.test(v.folder));

  // 영상 태그(약한 근거)는 제목에도 나오거나 "작품명 몰아보기" 꼴일 때만 점수가 붙으니, 그 밖의 태그는 TMDB 에 묻지 않는다
  // (채널이 영상마다 붙이는 태그 수십 개를 다 물어보느라 작품 찾기가 한 번에 몇 개밖에 못 하던 것)
  const cands = new Map(
    todo.map((v) => {
      const t = normalizeAlias(v.title);
      return [v.id, candidatesOf(v.title, v.tags, v.descTags).filter((c) => c.strong || c.review || t.includes(normalizeAlias(c.text)))];
    })
  );
  const aliases = await resolveAliases(
    [...cands.values()].flat().map((c) => c.text),
    deadline
  );
  const dict = await knownTitles();

  const workIds = new Set<string>(dict.map((d) => d.id));
  for (const a of aliases.values()) if (a.workId) workIds.add(a.workId);
  const works = new Map(
    (
      await prisma.radarWork.findMany({
        where: { id: { in: [...workIds] } },
        select: { id: true, title: true, popularity: true, category: true, cast: true, onAir: true, firstAirDate: true },
      })
    ).map((w) => [
      w.id,
      {
        main: normalizeAlias(mainTitle(w.title)),
        popularity: w.popularity ?? 0,
        category: w.category,
        recent: w.onAir || (w.firstAirDate != null && w.firstAirDate.getTime() > Date.now() - 60 * 24 * H),
        castNames: ((w.cast as { name?: string; order?: number }[] | null) ?? [])
          .filter((c) => (c.order ?? 9) < 6 && c.name)
          .map((c) => normalizeAlias(c.name!))
          .filter((n) => n.length >= 2),
      },
    ])
  );

  let matched = 0;
  const done: { id: string; workId: string | null; guessWorkId: string | null; score: string | null; by: string | null }[] = [];
  for (const v of todo) {
    const list = cands.get(v.id)!;
    // 후보를 아직 다 못 물어봤으면(시간 초과) 다음 번에
    if (list.some((c) => !aliases.has(normalizeAlias(c.text)))) continue;
    const titleNorm = normalizeAlias(v.title);
    const descNorm = normalizeAlias(v.descTags.join(' '));
    const dramaFolder = DRAMA_FOLDER_RE.test(v.folder);
    const hits = new Map<string, { n: number; by: string }>();
    const add = (workId: string, n: number, by: string) => {
      const h = hits.get(workId) ?? { n: 0, by };
      h.n += n;
      hits.set(workId, h);
    };
    for (const c of list) {
      const a = aliases.get(normalizeAlias(c.text));
      if (!a?.workId) continue;
      const w = works.get(a.workId);
      if (!w) continue;
      // 세 글자 이하 작품명은 드라마·영화·예능 채널의 제목·설명란 해시태그로만 (멤버 이름·흔한 말과 겹친다)
      if (w.main.length <= 3 && !(c.strong && dramaFolder)) continue;
      // 다섯 글자 이하 영어 말(#reina·#love)도 흔한 단어·사람 이름과 겹친다 — 드라마 채널에서, 방영 중이거나 인기 많은 작품일 때만
      const an = normalizeAlias(c.text);
      if (an.length <= 5 && /^[a-z0-9]+$/.test(an) && !(c.strong && dramaFolder && (w.recent || w.popularity >= 50))) continue;
      if (c.strong) add(a.workId, 2, c.text);
      // 영상 태그는 채널마다 늘 붙이는 말이 많아서, 작품명이 제목에도 있거나 "작품명 몰아보기" 꼴일 때만
      else if (c.review || titleNorm.includes(w.main)) add(a.workId, 1, c.text);
    }
    // 제목·설명란 안의 알려진 작품 제목 — 방영 중·최근 작품을 드라마 채널에서 보면 확정 근거
    for (const d of dict) {
      if (titleNorm.includes(d.main) || descNorm.includes(d.main)) {
        const w = works.get(d.id);
        add(d.id, w?.recent && dramaFolder ? 2 : 1.5, d.main);
      }
    }
    // 출연 배우 이름이 제목·설명란에 있으면 더 확실, 채널과 종류가 안 맞으면 감점
    for (const [workId, h] of hits) {
      const w = works.get(workId);
      if (!w) continue;
      if (w.castNames.some((n) => titleNorm.includes(n) || descNorm.includes(n))) h.n += 0.5;
      h.n += compatPenalty(v.folder, w.category);
    }
    const best = [...hits.entries()].sort(
      (x, y) => y[1].n - x[1].n || (works.get(y[0])?.popularity ?? 0) - (works.get(x[0])?.popularity ?? 0)
    )[0];
    const score = best?.[1].n ?? 0;
    const confident = score >= CONFIDENT_SCORE;
    const guess = !confident && score >= GUESS_SCORE;
    done.push({
      id: v.id,
      workId: confident ? best[0] : null,
      guessWorkId: guess ? best[0] : null,
      score: best ? String(score) : null,
      by: confident || guess ? best[1].by : null,
    });
    if (confident) matched++;
  }
  // 한 번에 저장 (영상마다 따로 쓰면 수백 번 왕복)
  if (done.length) {
    await prisma.$executeRaw`
      UPDATE "RadarVideo" r SET
        "workId" = u.wid, "guessWorkId" = u.gid, "matchScore" = u.score::double precision, "matchedBy" = u.by, "matchedAt" = ${now}
      FROM unnest(
        ${done.map((d) => d.id)}::text[], ${done.map((d) => d.workId)}::text[], ${done.map((d) => d.guessWorkId)}::text[],
        ${done.map((d) => d.score)}::text[], ${done.map((d) => d.by)}::text[]
      ) AS u(id, wid, gid, score, by)
      WHERE r.id = u.id AND NOT r."matchLocked"`;
  }
  return { matched, checked: done.length + skip.length };
}

/** 편성표·시즌·오픈에서 받은 TMDB 작품을 미리 넣어 둔다 — 제목만으로도 작품을 알아보게 */
export async function seedWorks(
  shows: { id: number; name: string; posterPath: string | null; category: string; networks: string[]; firstAirDate: string | null; popularity: number; kind?: string }[]
): Promise<void> {
  for (const s of shows) {
    const mediaType = s.kind === 'movie' ? 'movie' : 'tv';
    const id = `${mediaType}:${s.id}`;
    await prisma.radarWork.upsert({
      where: { id },
      create: {
        id,
        tmdbId: s.id,
        mediaType,
        title: s.name,
        year: s.firstAirDate ? s.firstAirDate.slice(0, 4) : null,
        category: s.category,
        posterPath: s.posterPath,
        networks: s.networks,
        firstAirDate: s.firstAirDate ? new Date(s.firstAirDate) : null,
        popularity: s.popularity,
      },
      update: { popularity: s.popularity },
    });
  }
}

type CastMember = { id: number; name: string; character: string | null; order: number; profilePath: string | null };

/** 영상이 붙은 작품의 상세 — 장르·방송사·방영 중·다음 회차·출연진. 방영 중인 작품은 하루마다 다시 */
export async function fetchWorkDetails(deadline: number, limit = 40): Promise<number> {
  const works = await prisma.$queryRaw<{ id: string; tmdbId: number; mediaType: string }[]>`
    SELECT w.id, w."tmdbId", w."mediaType" FROM "RadarWork" w
    WHERE w."detailAt" IS NULL OR (w."onAir" AND w."detailAt" < NOW() - INTERVAL '1 day')
    ORDER BY (SELECT COUNT(*) FROM "RadarVideo" v WHERE v."workId" = w.id) DESC
    LIMIT ${limit}`;
  let done = 0;
  await pool(works, 6, async (w) => {
    if (Date.now() > deadline) return;
    try {
      if (w.mediaType === 'tv') {
        const d = await tmdb<any>(`/tv/${w.tmdbId}`, { append_to_response: 'aggregate_credits' });
        const cast: CastMember[] = (d.aggregate_credits?.cast ?? [])
          .slice(0, 10)
          .map((c: any, i: number) => ({
            id: c.id,
            name: c.name,
            character: c.roles?.[0]?.character ?? null,
            order: i,
            profilePath: c.profile_path ?? null,
          }));
        await prisma.radarWork.update({
          where: { id: w.id },
          data: {
            title: d.name || undefined,
            genres: (d.genres ?? []).map((g: any) => g.id),
            originCountry: d.origin_country ?? [],
            networks: (d.networks ?? []).map((n: any) => n.name).slice(0, 4),
            onAir: !!d.next_episode_to_air || (d.status === 'Returning Series' && !!d.in_production),
            firstAirDate: d.first_air_date ? new Date(d.first_air_date) : null,
            lastAirDate: d.last_air_date ? new Date(d.last_air_date) : null,
            nextEpisodeAt: d.next_episode_to_air?.air_date ? new Date(d.next_episode_to_air.air_date) : null,
            lastEpisodeAt: d.last_episode_to_air?.air_date ? new Date(d.last_episode_to_air.air_date) : null,
            popularity: d.popularity ?? undefined,
            posterPath: d.poster_path ?? undefined,
            category: categoryOf('tv', d),
            cast: cast as unknown as Prisma.InputJsonValue,
            detailAt: new Date(),
          },
        });
      } else {
        const d = await tmdb<any>(`/movie/${w.tmdbId}`, { append_to_response: 'credits' });
        const cast: CastMember[] = (d.credits?.cast ?? [])
          .slice(0, 10)
          .map((c: any) => ({ id: c.id, name: c.name, character: c.character ?? null, order: c.order ?? 0, profilePath: c.profile_path ?? null }));
        await prisma.radarWork.update({
          where: { id: w.id },
          data: {
            title: d.title || undefined,
            genres: (d.genres ?? []).map((g: any) => g.id),
            originCountry: (d.production_countries ?? []).map((c: any) => c.iso_3166_1),
            networks: [],
            onAir: false,
            firstAirDate: d.release_date ? new Date(d.release_date) : null,
            popularity: d.popularity ?? undefined,
            posterPath: d.poster_path ?? undefined,
            category: categoryOf('movie', d),
            cast: cast as unknown as Prisma.InputJsonValue,
            detailAt: new Date(),
          },
        });
      }
      done++;
    } catch {
      /* 다음에 다시 */
    }
  });
  return done;
}

export type PersonCredit = {
  workId: string;
  tmdbId: number;
  mediaType: 'tv' | 'movie';
  title: string;
  year: string | null;
  category: string;
  posterPath: string | null;
  popularity: number;
  character: string | null;
};

/** 최근 영상이 붙은 작품의 주요 출연자(앞 4명) — 다른 출연작 (2주마다 새로) */
export async function fetchPersons(deadline: number, limit = 30): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: number; name: string; profilePath: string | null }[]>`
    WITH recent AS (
      SELECT DISTINCT w.cast FROM "RadarWork" w
      WHERE EXISTS (SELECT 1 FROM "RadarVideo" v WHERE v."workId" = w.id AND v."publishedAt" > NOW() - INTERVAL '14 days')
    ), people AS (
      SELECT DISTINCT (c->>'id')::int AS id, c->>'name' AS name, c->>'profilePath' AS "profilePath"
      FROM recent, jsonb_array_elements(recent.cast) c
      WHERE (c->>'order')::int < 4
    )
    SELECT p.* FROM people p
    LEFT JOIN "RadarPerson" rp ON rp.id = p.id
    WHERE rp.id IS NULL OR rp."updatedAt" < NOW() - INTERVAL '14 days' OR rp.credits = '[]'::jsonb
    LIMIT ${limit}`;
  let done = 0;
  await pool(rows, 6, async (p) => {
    if (Date.now() > deadline) return;
    try {
      const d = await tmdb<{ cast?: any[] }>(`/person/${p.id}/combined_credits`);
      const credits: PersonCredit[] = (d.cast ?? [])
        .filter((c) => c.media_type === 'tv' || c.media_type === 'movie')
        // 뉴스 출연·한 회 게스트(본인 역)는 뺀다
        .filter((c) => !(c.genre_ids ?? []).includes(10763))
        .filter((c) => !(c.media_type === 'tv' && (c.episode_count ?? 0) <= 1 && /^(self|himself|herself|본인|자신)/i.test(c.character ?? '')))
        .filter((c) => (c.popularity ?? 0) >= 1 || (c.vote_count ?? 0) >= 3)
        .map((c) => ({
          workId: `${c.media_type}:${c.id}`,
          tmdbId: c.id,
          mediaType: c.media_type,
          title: (c.name || c.title || '').trim(),
          year: (c.first_air_date || c.release_date || '').slice(0, 4) || null,
          category: categoryOf(c.media_type, c),
          posterPath: c.poster_path ?? null,
          popularity: c.popularity ?? 0,
          character: c.character ?? null,
        }));
      const unique = [...new Map(credits.map((c) => [c.workId, c])).values()].sort((a, b) => b.popularity - a.popularity).slice(0, 30);
      await prisma.radarPerson.upsert({
        where: { id: p.id },
        create: { id: p.id, name: p.name, profilePath: p.profilePath, credits: unique as unknown as Prisma.InputJsonValue },
        update: { name: p.name, profilePath: p.profilePath, credits: unique as unknown as Prisma.InputJsonValue },
      });
      done++;
    } catch {
      /* 다음에 다시 */
    }
  });
  return done;
}
