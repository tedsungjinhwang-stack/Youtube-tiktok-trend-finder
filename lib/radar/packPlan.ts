/**
 * 팩별 검색어 계획 — Claude 가 채널팩마다 '새 채널을 찾을 유튜브 검색어'를 만들고, 팩에 없는 새 카테고리를 제안한다.
 * 하루 한 번 (pg_cron → /api/cron/pack-plan, 또는 신규 발굴 화면 버튼). 수집기의 신규 발굴이 이 검색어를 돌아가며 쓴다.
 * Claude 는 검색어만 만든다 — 실제 검색은 유튜브 API, 채널 거르기(대박 신생 · 최근 잘 나옴)는 코드가 한다.
 */

import { prisma } from '@/lib/db';
import { googleTrending } from '@/lib/trends/google';
import { hotKeywords } from './brief';
import { askClaude, extractJson } from './claude';

const KEY = 'radar:pack-plan';
/** 주제가 아니라 규모·성격으로 묶은 팩 */
const META_PACKS = new Set(['넘사', '고래', 'No양산형', '주제 자주 변경', '제외', '대기업', '방송사 채널팩', '뉴스공식', '저작권ㄱㅊ?']);

export type PackPlan = {
  generatedAt: string;
  costKrw: number;
  packs: { pack: string; queries: string[] }[];
  newCategories: { name: string; description: string; why: string; queries: string[] }[];
};

const SYSTEM = `너는 한국 유튜브 쇼츠 시장을 잘 아는 리서처다. 운영자는 채널팩(카테고리)별로 '최근 조회수가 잘 나오는 한국어 신규 채널'을 계속 모으고 싶다.
유튜브 검색 API(최근 7일 영상, 조회수 순, 한국 지역)에 넣을 검색어를 만든다.

규칙:
- 팩마다 검색어 3개. 그 팩 채널들이 실제로 쓰는 소재·포맷·해시태그 말로 (예: "드라마 명장면 몰아보기", "#아이브 직캠", "시어머니 며느리 사연"). 팩의 최근 인기 영상 제목과 지금 뜨는 키워드를 참고해 요즘 걸 반영한다.
- 너무 넓은 말(쇼츠, 영상, 재밌는)은 쓰지 않는다. 한 검색어는 2~5단어. 한국어 위주 (해외 소재 팩도 한국 시청자가 쓰는 말로).
- 새 카테고리: 구글 급상승·뜨는 키워드를 보고 기존 팩에 없지만 쇼츠 채널이 모일 만한 주제를 최대 5개 (이름 짧게, 설명 한 줄, 왜 지금인지, 검색어 3개). 기존 팩과 겹치면 내지 않는다.
- 출력: JSON 객체 하나만. 코드 블록·설명 없이.
{"packs":[{"pack":"팩 이름 그대로","queries":["","",""]}],"newCategories":[{"name":"","description":"","why":"","queries":["","",""]}]}`;

export async function generatePackPlan(): Promise<PackPlan> {
  const [folders, keywords, google] = await Promise.all([
    prisma.$queryRaw<{ id: string; name: string; description: string | null; ch: number }[]>`
      SELECT f.id, f.name, f.description, COUNT(c.id)::int AS ch
      FROM "Folder" f JOIN "Channel" c ON c."folderId" = f.id AND c."isActive" AND c.platform = 'YOUTUBE'
      GROUP BY f.id HAVING COUNT(c.id) >= 10`,
    hotKeywords().catch(() => []),
    googleTrending(24)
      .then((r) => r.data)
      .catch(() => []),
  ]);
  const packs = folders.filter((f) => !f.name.startsWith('__') && !META_PACKS.has(f.name));
  const tops = await prisma.$queryRaw<{ folderId: string; title: string }[]>`
    SELECT "folderId", title FROM (
      SELECT c."folderId", v.title, ROW_NUMBER() OVER (PARTITION BY c."folderId" ORDER BY v.views DESC) AS rn
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId"
      WHERE v."publishedAt" > NOW() - INTERVAL '7 days' AND c."folderId" = ANY(${packs.map((p) => p.id)}::text[])
    ) x WHERE rn <= 5`;
  const input = {
    packs: packs.map((p) => ({
      pack: p.name,
      description: p.description?.slice(0, 120) ?? null,
      channels: p.ch,
      topVideos: tops.filter((t) => t.folderId === p.id).map((t) => t.title.slice(0, 70)),
    })),
    hotKeywords: keywords.slice(0, 30).map((k) => k.word),
    googleTrending: (google as { query: string }[]).slice(0, 25).map((g) => g.query),
  };
  const r = await askClaude({
    system: SYSTEM,
    user: `<자료>\n${JSON.stringify(input)}\n</자료>`,
    maxTokens: 16000,
    effort: 'low',
  });
  const j = extractJson(r.text) as { packs?: any[]; newCategories?: any[] } | null;
  if (!j) throw new Error('Claude 응답을 읽지 못했습니다 — 다시 시도해 주세요');
  const known = new Set(packs.map((p) => p.name));
  const qs = (v: unknown) =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === 'string' && x.trim().length >= 2)
      .map((x) => x.trim())
      .slice(0, 3);
  const plan: PackPlan = {
    generatedAt: new Date().toISOString(),
    costKrw: r.costKrw,
    packs: (j.packs ?? []).filter((p) => known.has(p?.pack)).map((p) => ({ pack: p.pack as string, queries: qs(p.queries) })).filter((p) => p.queries.length),
    newCategories: (j.newCategories ?? [])
      .filter((c) => typeof c?.name === 'string' && c.name.trim() && !known.has(c.name.trim()))
      .slice(0, 5)
      .map((c) => ({ name: String(c.name).trim(), description: String(c.description ?? ''), why: String(c.why ?? ''), queries: qs(c.queries) }))
      .filter((c) => c.queries.length),
  };
  await prisma.trendCache.upsert({ where: { key: KEY }, create: { key: KEY, payload: plan as object }, update: { payload: plan as object, fetchedAt: new Date() } });
  return plan;
}

export async function lastPackPlan(): Promise<PackPlan | null> {
  const row = await prisma.trendCache.findUnique({ where: { key: KEY } }).catch(() => null);
  return (row?.payload as unknown as PackPlan) ?? null;
}
