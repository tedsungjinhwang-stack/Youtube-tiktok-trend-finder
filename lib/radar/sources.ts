/**
 * 원본 채널 레이더 — 짜깁기 채널이 어떤 원본(유튜브 예능 쇼 · 스케치코미디 채널)을 잘라 올리는지, 어느 원본이 지금 뜨는지.
 *
 * 짜깁기 채널은 원본을 해시태그·태그로 적는다 (스케치 팩 14일: #숏박스 클립 41개 · 7채널 · 2,158만 회, #김원훈 · #조진세 처럼 멤버도).
 * 유튜브 예능(웹예능)은 TMDB 에 없어서 작품 인식으로는 못 잡는다 — 여기서 이름으로 센다.
 * 목록은 굿데이터 펀덱스 유튜브 예능 화제성(2026년 10~11월)과 우리 수집 데이터(팩 안 해시태그 빈도)로 골랐다. 새 원본은 여기에 더하면 된다.
 * 한국어 채널의 클립만 센다 (해외 채널 제외). 6시간마다 미리 계산(radar-precompute) — 짜깁기 팩 7일 영상 제목·태그를 훑어 무겁다.
 */

import { prisma } from '@/lib/db';
import { KO_TITLE_RATIO } from './lang';

export type SourceKind = 'sketch' | 'yt_variety';

type SourceDef = { name: string; kind: SourceKind; /** 공백·기호 없이 소문자 — 제목·태그에서 찾을 말 */ aliases: string[]; note?: string };

/** 원본을 셀 짜깁기 채널팩 */
export const SOURCE_PACKS: Record<SourceKind, string[]> = {
  sketch: ['스케치코미디'],
  yt_variety: ['한국 예능', '연예 이슈', '셀럽 팬튜브', '시니어 | 연예이슈'],
};

export const SOURCES: SourceDef[] = [
  // ── 스케치코미디 원본 채널 (스케치 팩 해시태그 상위 + 스케치코미디(원본) 팩)
  { kind: 'sketch', name: '숏박스', aliases: ['숏박스', '김원훈', '조진세', '엄지윤'] },
  { kind: 'sketch', name: '너덜트', aliases: ['너덜트'] },
  { kind: 'sketch', name: '킥서비스', aliases: ['킥서비스'] },
  { kind: 'sketch', name: '하이픽션', aliases: ['하이픽션'] },
  { kind: 'sketch', name: '웃기시네', aliases: ['웃기시네'] },
  { kind: 'sketch', name: '픽고', aliases: ['픽고'] },
  { kind: 'sketch', name: '피식대학', aliases: ['피식대학', '피식쇼'] },
  { kind: 'sketch', name: '빠더너스', aliases: ['빠더너스', '문상훈'] },
  { kind: 'sketch', name: '별놈들', aliases: ['별놈들'] },
  { kind: 'sketch', name: '장삐쭈', aliases: ['장삐쭈'] },
  { kind: 'sketch', name: '꼰대희', aliases: ['꼰대희', '밥묵자'] },
  { kind: 'sketch', name: '엔조이커플', aliases: ['엔조이커플'] },
  { kind: 'sketch', name: '김똘똘', aliases: ['김똘똘', 'ddolddol'] },
  { kind: 'sketch', name: '대니초', aliases: ['대니초', 'dannycho'] },
  { kind: 'sketch', name: 'Althea', aliases: ['althea'] },
  { kind: 'sketch', name: '하이컷', aliases: ['하이컷', 'hicut'] },
  // ── 유튜브 예능 (펀덱스 유튜브 예능 화제성 상위 + 예능 팩에서 클립이 도는 것)
  { kind: 'yt_variety', name: '핑계고 (뜬뜬)', aliases: ['핑계고', '뜬뜬'] },
  { kind: 'yt_variety', name: '살롱드립 (TEO)', aliases: ['살롱드립'] },
  { kind: 'yt_variety', name: '짠한형 신동엽', aliases: ['짠한형'] },
  { kind: 'yt_variety', name: '노빠꾸탁재훈', aliases: ['노빠꾸', '노빠꾸탁재훈'] },
  { kind: 'yt_variety', name: '미미미누', aliases: ['미미미누'] },
  { kind: 'yt_variety', name: '안녕하세요원이입니다잘부탁드립니다', aliases: ['안원잘부', '안녕하세요원이입니다'] },
  { kind: 'yt_variety', name: '침착맨', aliases: ['침착맨'] },
  { kind: 'yt_variety', name: '워크맨·워크돌', aliases: ['워크맨', '워크돌'] },
  { kind: 'yt_variety', name: '스튜디오 프로미스나인', aliases: ['스튜디오프로미스나인'] },
  { kind: 'yt_variety', name: '불꽃야구', aliases: ['불꽃야구'] },
  { kind: 'yt_variety', name: '성시경 (먹을텐데·만날텐데)', aliases: ['먹을텐데', '만날텐데', '성시경'] },
  { kind: 'yt_variety', name: '전과자', aliases: ['전과자'] },
  { kind: 'yt_variety', name: '존이냐박이냐', aliases: ['존이냐박이냐'] },
  { kind: 'yt_variety', name: '할명수', aliases: ['할명수'] },
  { kind: 'yt_variety', name: '차린건 쥐뿔도 없지만', aliases: ['차린건쥐뿔도없지만', '차쥐뿔'] },
  { kind: 'yt_variety', name: '풍향고', aliases: ['풍향고'] },
  { kind: 'yt_variety', name: '나불나불 (채널십오야)', aliases: ['나불나불', '출장십오야', '채널십오야'] },
  { kind: 'yt_variety', name: '냉터뷰 (일일칠)', aliases: ['냉터뷰'] },
  { kind: 'yt_variety', name: '요정재형', aliases: ['요정재형'] },
  { kind: 'yt_variety', name: '나래식', aliases: ['나래식'] },
  { kind: 'yt_variety', name: '홍석천의 보석함', aliases: ['홍석천의보석함'] },
  { kind: 'yt_variety', name: '문명특급', aliases: ['문명특급'] },
];

export type SourceRow = {
  name: string;
  kind: SourceKind;
  /** 최근 3일 클립 수 · 클립 올린 채널 수 · 클립 조회 합 · 24시간 증가 합 */
  clips3d: number;
  channels3d: number;
  views3d: number;
  gain24h: number;
  /** 그 전 4일(4~7일 전) 클립 수 · 조회 — 오르는 중인지 */
  clipsPrev: number;
  viewsPrev: number;
  top: { id: string; title: string; views: number; channel: string } | null;
};
export type SourceBoard = { at: string; rows: SourceRow[] };

const KEY = 'radar:sources';

/** 미리 계산(6시간마다) — 짜깁기 팩 7일 영상 제목·태그에서 원본 이름을 찾아 센다 */
export async function refreshSources(): Promise<SourceBoard> {
  const aliasRows = SOURCES.flatMap((s, i) => s.aliases.map((a) => ({ i, a, kind: s.kind })));
  const packs = [...new Set(Object.values(SOURCE_PACKS).flat())];
  const hits = await prisma.$queryRaw<{ i: number; id: string; title: string; views: number; gain24h: number | null; recent: boolean; channelId: string; channel: string }[]>`
    WITH v AS MATERIALIZED (
      SELECT v.id, v.title, v.views, v."gain24h", v."channelId", COALESCE(c."displayName", c."externalId") AS channel, f.name AS pack,
        (v."publishedAt" > NOW() - INTERVAL '3 days') AS recent,
        lower(regexp_replace(v.title || ' ' || array_to_string(v.tags, ' ') || ' ' || array_to_string(COALESCE(v."descTags", '{}'), ' '), '[[:space:][:punct:]]', '', 'g')) AS txt
      FROM "RadarVideo" v JOIN "Channel" c ON c.id = v."channelId" JOIN "Folder" f ON f.id = c."folderId"
      WHERE c."isActive" AND f.name = ANY(${packs}::text[]) AND v."publishedAt" > NOW() - INTERVAL '7 days'
        AND (c."displayName" ~ '[가-힣]' OR c."koRatio" >= ${KO_TITLE_RATIO})
    ), a AS (
      SELECT * FROM unnest(${aliasRows.map((r) => r.i)}::int[], ${aliasRows.map((r) => r.a)}::text[], ${aliasRows.map((r) => r.kind)}::text[]) AS a(i, alias, kind)
    )
    SELECT DISTINCT ON (a.i, v.id) a.i, v.id, v.title, v.views, v."gain24h", v.recent, v."channelId", v.channel
    FROM a JOIN v ON strpos(v.txt, a.alias) > 0
      AND v.pack = ANY(CASE a.kind WHEN 'sketch' THEN ${SOURCE_PACKS.sketch}::text[] ELSE ${SOURCE_PACKS.yt_variety}::text[] END)`;

  const rows: SourceRow[] = SOURCES.map((s, i) => {
    const mine = hits.filter((h) => h.i === i);
    const recent = mine.filter((h) => h.recent);
    const prev = mine.filter((h) => !h.recent);
    const best = [...recent].sort((a, b) => b.views - a.views)[0];
    return {
      name: s.name,
      kind: s.kind,
      clips3d: recent.length,
      channels3d: new Set(recent.map((h) => h.channelId)).size,
      views3d: recent.reduce((t, h) => t + h.views, 0),
      gain24h: recent.reduce((t, h) => t + (h.gain24h ?? 0), 0),
      clipsPrev: prev.length,
      viewsPrev: prev.reduce((t, h) => t + h.views, 0),
      top: best ? { id: best.id, title: best.title, views: best.views, channel: best.channel } : null,
    };
  })
    .filter((r) => r.clips3d + r.clipsPrev > 0)
    .sort((a, b) => b.gain24h - a.gain24h || b.views3d - a.views3d);
  const out: SourceBoard = { at: new Date().toISOString(), rows };
  await prisma.trendCache.upsert({ where: { key: KEY }, create: { key: KEY, payload: out as object }, update: { payload: out as object, fetchedAt: new Date() } }).catch(() => {});
  return out;
}

/** 저장본 (없으면 null — 화면·AI 는 기다리지 않는다) */
export async function getSources(kind?: SourceKind): Promise<SourceBoard | null> {
  const c = await prisma.trendCache.findUnique({ where: { key: KEY } }).catch(() => null);
  if (!c) return null;
  const b = c.payload as unknown as SourceBoard;
  return kind ? { ...b, rows: b.rows.filter((r) => r.kind === kind) } : b;
}
