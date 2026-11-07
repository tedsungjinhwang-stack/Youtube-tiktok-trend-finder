/**
 * 쇼츠 화면 구성(템플릿) 분류 — 채널의 잘 나온 쇼츠 썸네일(첫 화면, 480×360)을 Claude 가 보고
 * 인스타형 · 제목바형 · 풀화면 · 위아래 분할 · 글·캡처형 · 인물 토크형 · AI 이미지 · 랭킹형으로 나눈다.
 *
 * 대상: 팩마다 하루 조회 상위 6곳 + 비교용으로 상위 60곳 중 일부(채널 id 해시로 고정) — 약 1,000곳.
 * 한 번 분류하면 30일 동안 다시 안 본다. 정비 작업(2시간마다)이 시간 안에서 조금씩 채운다.
 * 이미지 한 장 약 230 토큰 — 20장씩 묶어 한 번에.
 */

import { prisma } from '@/lib/db';
import { askClaude, extractJson, hasClaudeKey } from './claude';
import type Anthropic from '@anthropic-ai/sdk';

export const LAYOUTS = {
  insta: '인스타형',
  titlebar: '일반형 제목바',
  full: '풀화면',
  split: '위아래 분할',
  text: '글·캡처형',
  talk: '인물 토크형',
  ai: 'AI 이미지',
  ranking: '랭킹형',
  other: '기타',
} as const;
export type LayoutKey = keyof typeof LAYOUTS;
export const LAYOUT_TAGS = ['댓글카드', '큰자막', '출처표기', '작품명', '반응컷'] as const;

const META_PACKS = ['넘사', '고래', 'No양산형', '주제 자주 변경', '제외', '대기업', '방송사 채널팩', '뉴스공식', '저작권ㄱㅊ?'];
const REFRESH_DAYS = 30;
const BATCH = 20;

const SYSTEM = `너는 유튜브 쇼츠 화면 구성(템플릿)을 분류한다. 이미지는 쇼츠 썸네일이다 — 가운데 세로 화면이 실제 영상이고, 양옆은 흐린 배경일 수 있다(무시).
각 이미지의 세로 화면 구성을 하나로 고른다:
- insta: 인스타 게시물처럼 생긴 틀 — 흰(밝은) 배경 위쪽에 문장형 캡션 글(검은 글씨, 작은~중간 크기, 1~3줄) + 가운데 사진·영상. 위에 계정 이름·프로필이 있거나 아래 좋아요·댓글 표시가 있으면 확실
- titlebar: 일반형 — 검은(어두운) 배경 위(·아래) 띠에 굵고 큰 색 자막 제목(빨강·노랑·흰 굵은 글씨 1~2줄) + 가운데 영상
- full: 영상이 세로 화면 전체를 채움 (자막만 얹음)
- split: 서로 다른 두 영상이 위아래로 나뉨 (예: 위 일반 영상 · 아래 게임·악기·만족 영상)
- text: 글이 주인공 — 커뮤니티 글·트윗 같은 SNS 게시물 캡처, 채팅·문자 화면, 썰 텍스트
- talk: 진행자·인물이 카메라를 보고 말하는 화면 위주
- ai: AI 생성 이미지·애니메이션·CG 위주
- ranking: 순위 번호·목록이 화면 구성의 중심
- other: 위에 없음
요소(tags, 해당하는 것만): 댓글카드(댓글 캡처가 화면에 얹힘) · 큰자막(화면 중간·아래 굵은 자막) · 출처표기(출처·채널명 표기) · 작품명(드라마·영화 제목 표기) · 반응컷(작은 창에 반응하는 얼굴)
출력: JSON 객체 하나만 {"r":[[번호,"layout",["tag"]], ...]} — 코드 블록·설명 없이, 받은 이미지 모두.`;

type Target = { id: string; videoId: string };

/** 분류할 채널 — 대상 중 아직 안 했거나 30일 지난 것, 잘 나가는 채널부터 */
export async function layoutTargets(limit: number): Promise<Target[]> {
  return prisma.$queryRaw<Target[]>`
    WITH ch AS (
      SELECT c.id, c."dailyViews", c."layoutAt",
        ROW_NUMBER() OVER (PARTITION BY c."folderId" ORDER BY c."dailyViews" DESC NULLS LAST) AS rk
      FROM "Channel" c JOIN "Folder" f ON f.id = c."folderId"
      WHERE c."isActive" AND c.platform = 'YOUTUBE'
        AND f.name <> ALL(${META_PACKS}::text[]) AND f.name NOT LIKE '\\_\\_%'
    ), pick AS (
      SELECT * FROM ch
      WHERE (rk <= 6 OR (rk <= 60 AND abs(hashtext(id)) % 10 = 0))
        AND ("layoutAt" IS NULL OR "layoutAt" < NOW() - make_interval(days => ${REFRESH_DAYS}::int))
    )
    SELECT p.id, v.id AS "videoId" FROM pick p
    CROSS JOIN LATERAL (
      SELECT id FROM "RadarVideo" v
      WHERE v."channelId" = p.id AND v."publishedAt" > NOW() - INTERVAL '21 days' AND v."durationSec" BETWEEN 1 AND 180
      ORDER BY v.views DESC LIMIT 1
    ) v
    ORDER BY p."layoutAt" NULLS FIRST, p.rk, p."dailyViews" DESC NULLS LAST
    LIMIT ${limit}::int`;
}

async function thumb(videoId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer()).toString('base64');
  } catch {
    return null;
  }
}

/** 20장 한 묶음 — 분류한 채널 수와 비용 */
async function classifyBatch(items: Target[]): Promise<{ done: number; costKrw: number }> {
  const imgs = await Promise.all(items.map((t) => thumb(t.videoId)));
  const ok = items.map((t, i) => ({ t, b64: imgs[i] })).filter((x): x is { t: Target; b64: string } => !!x.b64);
  // 썸네일이 없는 영상(삭제 등)은 다음에 다른 영상으로 — 표시만 해 둔다
  const missing = items.filter((_, i) => !imgs[i]).map((t) => t.id);
  if (missing.length) await prisma.channel.updateMany({ where: { id: { in: missing } }, data: { layoutAt: new Date(Date.now() - (REFRESH_DAYS - 3) * 86_400_000) } });
  if (!ok.length) return { done: 0, costKrw: 0 };

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  ok.forEach((x, i) => {
    content.push({ type: 'text', text: `#${i + 1}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: x.b64 } });
  });
  content.push({ type: 'text', text: `이미지 ${ok.length}장을 분류해라.` });
  const r = await askClaude({ system: SYSTEM, user: content, maxTokens: 6000, effort: 'low', timeoutMs: 120_000 });
  const j = extractJson(r.text) as { r?: unknown[] } | null;
  const rows = Array.isArray(j?.r) ? j!.r : [];
  const now = new Date();
  let done = 0;
  await Promise.all(
    rows.map(async (row) => {
      if (!Array.isArray(row)) return;
      const n = Number(row[0]);
      const x = ok[n - 1];
      if (!x) return;
      const layout = (Object.keys(LAYOUTS) as LayoutKey[]).includes(row[1] as LayoutKey) ? (row[1] as LayoutKey) : 'other';
      const tags = (Array.isArray(row[2]) ? row[2] : []).filter((t: unknown): t is string => typeof t === 'string' && (LAYOUT_TAGS as readonly string[]).includes(t));
      await prisma.channel.update({ where: { id: x.t.id }, data: { layout, layoutTags: tags, layoutAt: now, layoutVideoId: x.t.videoId } });
      done++;
    })
  );
  return { done, costKrw: r.costKrw };
}

/** 정비 작업이 부른다 — deadline 까지 묶음 3개씩 동시에 */
export async function runLayoutClassify(o: { deadline: number; max: number }): Promise<{ classified: number; costKrw: number; left: number }> {
  if (!(await hasClaudeKey())) return { classified: 0, costKrw: 0, left: 0 };
  const targets = await layoutTargets(o.max);
  const batches: Target[][] = [];
  for (let i = 0; i < targets.length; i += BATCH) batches.push(targets.slice(i, i + BATCH));
  let classified = 0;
  let costKrw = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, batches.length) }, async () => {
      // 한 묶음이 30~60초 — 끝낼 시간이 70초 넘게 남았을 때만 새로 시작
      while (next < batches.length && Date.now() < o.deadline - 70_000) {
        const b = batches[next++];
        try {
          const r = await classifyBatch(b);
          classified += r.done;
          costKrw += r.costKrw;
        } catch {
          // 한 묶음 실패는 다음 정비 때 다시
        }
      }
    })
  );
  return { classified, costKrw, left: await layoutBacklog() };
}

/** 아직 분류 안 했거나 30일 지난 대상 채널 수 (쇼츠가 없는 채널 포함 — 대략) */
export async function layoutBacklog(): Promise<number> {
  const r = await prisma.$queryRaw<{ n: number }[]>`
    WITH ch AS (
      SELECT c.id, c."layoutAt", ROW_NUMBER() OVER (PARTITION BY c."folderId" ORDER BY c."dailyViews" DESC NULLS LAST) AS rk
      FROM "Channel" c JOIN "Folder" f ON f.id = c."folderId"
      WHERE c."isActive" AND c.platform = 'YOUTUBE' AND f.name <> ALL(${META_PACKS}::text[]) AND f.name NOT LIKE '\\_\\_%'
    )
    SELECT COUNT(*)::int AS n FROM ch
    WHERE (rk <= 6 OR (rk <= 60 AND abs(hashtext(id)) % 10 = 0))
      AND ("layoutAt" IS NULL OR "layoutAt" < NOW() - make_interval(days => ${REFRESH_DAYS}::int))`.catch(() => [{ n: 0 }]);
  return r[0]?.n ?? 0;
}
