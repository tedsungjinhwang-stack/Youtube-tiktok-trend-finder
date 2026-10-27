/**
 * 작품 인식이 스스로 나아지게 — AI 없이 모은 영상 통계로 (수집기가 6시간마다 부른다).
 *
 *  1. 별칭 배우기: 작품이 확정된 영상에 같이 붙은 해시태그(줄임말·배역 이름 등)를 센다.
 *     여러 채널에서 3번 이상 같은 작품과 붙고, 그 말이 나온 영상의 60% 이상이 그 작품이면 별칭으로 배운다.
 *     예) #슬의생 이 #슬기로운의사생활 과 함께 자주 나오면 → 다음부터는 #슬의생 만 있어도 그 작품
 *  2. 자동 막기: 짧은(네 글자 이하) 별칭이 주로 작품과 상관없는 채널(팬튜브·커뮤 등)에서만 나오면
 *     사람 이름 같은 말로 보고 막는다. 예) #레이 가 대부분 아이돌 팬튜브에서 나오면 → 영화 「레이」로 안 붙임
 *  배우거나 막은 게 있으면 그 말이 걸린 영상을 다시 찾게 한다.
 */

import { prisma } from '@/lib/db';
import { candidatesOf, normalizeAlias } from './match';

/** 드라마·영화·예능 클립 채널 (match.ts 의 DRAMA_FOLDER_RE 와 같은 뜻) */
const DRAMA_FOLDER_RE = /(영드짜|드짜|드라마|영화|예능|애니)/;

/** 날짜·개봉·예고 같은 홍보 말 — 그 주에 나온 작품 하나에 몰려 붙어도 작품 이름이 아니다 (#11월개봉 · #10월28일대개봉) */
const PROMO_RE = /(\d+월|\d+일|개봉|예고|티저|공개|첫방|본방|방송|예매|극장|시사회|커밍순|comingsoon|trailer|teaser|^d\d+$)/;

/**
 * 배울 만한 별칭인지 — 작품 제목과 글자를 나눠 가져야 한다.
 * 줄임말(#우발 → 우리들의 발라드)·표기 차이(#닥터엑스 → 닥터X)·시즌 꼬리(#신병4)는 통과,
 * 사람 이름(#아이유 → 폭싹 속았수다)·회사·프랜차이즈(#마블 → 어벤져스)처럼 제목과 상관없는 말은 걸러진다.
 */
export function learnable(alias: string, titles: (string | null)[], persons: Set<string>): boolean {
  if (PROMO_RE.test(alias) || persons.has(alias)) return false;
  const letters = [...new Set(alias.replace(/\d/g, ''))];
  if (!letters.length) return false;
  const pool = new Set(titles.filter(Boolean).map((t) => normalizeAlias(t!)).join(''));
  const hit = letters.filter((ch) => pool.has(ch)).length;
  return hit >= Math.min(2, letters.length) && hit / letters.length >= 0.5;
}

export async function learnAliases(): Promise<{ learned: number; blocked: number; forgotten: number; requeued: number }> {
  const vids = await prisma.$queryRaw<
    { id: string; title: string; tags: string[]; descTags: string[]; workId: string | null; matchedBy: string | null; folder: string; channelId: string }[]
  >`
    SELECT v.id, v.title, v.tags, v."descTags", v."workId", v."matchedBy", f.name AS folder, v."channelId"
    FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId" JOIN "Folder" f ON f.id = c."folderId"
    WHERE v."publishedAt" > NOW() - INTERVAL '30 days' AND v."matchedAt" IS NOT NULL
    LIMIT 60000`;
  if (!vids.length) return { learned: 0, blocked: 0, forgotten: 0, requeued: 0 };

  const known = new Map(
    (await prisma.radarAlias.findMany({ select: { alias: true, workId: true, personId: true, blocked: true, source: true } })).map((a) => [a.alias, a])
  );

  // 말마다: 나온 영상 수, 작품별로 같이 나온 횟수·채널, 드라마 채널 비율
  const occ = new Map<string, number>();
  const co = new Map<string, Map<string, { n: number; channels: Set<string> }>>();
  const folderOcc = new Map<string, { total: number; drama: number }>();
  for (const v of vids) {
    const drama = DRAMA_FOLDER_RE.test(v.folder);
    const seen = new Set<string>();
    for (const c of candidatesOf(v.title, v.tags, v.descTags)) {
      const n = normalizeAlias(c.text);
      if (seen.has(n)) continue;
      seen.add(n);
      const f = folderOcc.get(n) ?? { total: 0, drama: 0 };
      f.total++;
      if (drama) f.drama++;
      folderOcc.set(n, f);
      if (!c.strong) continue;
      occ.set(n, (occ.get(n) ?? 0) + 1);
      if (!v.workId) continue;
      const a = known.get(n);
      // 이미 아는 말(작품·인물·막은 말)은 배울 필요 없음
      if (a && (a.workId || a.personId || a.blocked)) continue;
      const byWork = co.get(n) ?? new Map();
      const e = byWork.get(v.workId) ?? { n: 0, channels: new Set<string>() };
      e.n++;
      e.channels.add(v.channelId);
      byWork.set(v.workId, e);
      co.set(n, byWork);
    }
  }

  // 작품 제목(한국어·원제)과 인물 이름 — 배울 만한 말인지 가릴 때
  const workTitles = new Map(
    (await prisma.radarWork.findMany({ select: { id: true, title: true, originalTitle: true } })).map((w) => [w.id, [w.title, w.originalTitle]])
  );
  const persons = new Set((await prisma.radarPerson.findMany({ select: { name: true } })).map((p) => normalizeAlias(p.name)));

  // 0. 전에 배운 말 중 지금 기준에 안 맞는 건 잊는다
  const forgotten: string[] = [];
  for (const [alias, a] of known) {
    if (a.source !== 'learned' || !a.workId) continue;
    if (!learnable(alias, workTitles.get(a.workId) ?? [], persons)) forgotten.push(alias);
  }
  if (forgotten.length) {
    await prisma.radarAlias.deleteMany({ where: { alias: { in: forgotten }, source: 'learned' } });
    for (const f of forgotten) known.delete(f);
  }

  // 1. 별칭 배우기
  const learned: { alias: string; workId: string }[] = [];
  for (const [alias, byWork] of co) {
    if (alias.length < 2) continue;
    const [workId, e] = [...byWork.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    const total = occ.get(alias) ?? e.n;
    if (e.n >= 3 && e.channels.size >= 2 && e.n / total >= 0.6 && learnable(alias, workTitles.get(workId) ?? [], persons)) {
      learned.push({ alias, workId });
    }
  }
  for (const l of learned) {
    await prisma.radarAlias.upsert({
      where: { alias: l.alias },
      create: { alias: l.alias, workId: l.workId, source: 'learned' },
      update: { workId: l.workId, source: 'learned', blocked: false, blockReason: null, checkedAt: new Date() },
    });
  }

  // 2. 자동 막기 — 직접 정한(manual) 별칭은 건드리지 않는다
  const toBlock: string[] = [];
  for (const [alias, a] of known) {
    // 네 글자 이하, 영어는 여섯 글자 이하 (#reina 같은 이름)
    const shortName = alias.length <= 4 || (alias.length <= 6 && /^[a-z0-9]+$/.test(alias));
    if (!a.workId || a.blocked || a.source === 'manual' || !shortName) continue;
    const f = folderOcc.get(alias);
    if (f && f.total >= 5 && f.drama / f.total < 0.3) toBlock.push(alias);
  }
  if (toBlock.length) {
    await prisma.radarAlias.updateMany({
      where: { alias: { in: toBlock } },
      data: { blocked: true, blockReason: '주로 작품과 상관없는 채널에서 나와서 자동으로 막음' },
    });
  }

  // 배운 말·막은 말이 걸린 영상은 다시 찾게 (직접 고친 영상은 그대로)
  const touched = new Set([...learned.map((l) => l.alias), ...toBlock, ...forgotten]);
  const requeue = touched.size
    ? vids
        .filter((v) => {
          if (v.matchedBy && touched.has(normalizeAlias(v.matchedBy))) return true;
          return candidatesOf(v.title, v.tags, v.descTags).some((c) => touched.has(normalizeAlias(c.text)));
        })
        .map((v) => v.id)
    : [];
  if (requeue.length) {
    await prisma.radarVideo.updateMany({ where: { id: { in: requeue }, matchLocked: false }, data: { matchedAt: null } });
  }
  return { learned: learned.length, blocked: toBlock.length, forgotten: forgotten.length, requeued: requeue.length };
}
