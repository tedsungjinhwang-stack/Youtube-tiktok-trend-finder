/**
 * 대시보드 AI 채팅 — 오른쪽 아래 채팅창에서 대시보드 데이터로 묻고 답한다 (Claude Opus 5.5 · 도구 사용 루프).
 *
 * 도구 2개:
 *  - sql_query: 읽기 전용 SELECT. DB 역할 dashboard_agent_reader 로 바꿔서 돌린다 — 이 역할은 SELECT 만 있고
 *    비밀 표(Credential · YoutubeApiKey · ChannelYouTubeOAuth · GoogleOAuth · TodoistConfig)는 권한 자체가 없다.
 *    한 번에 20초 · 200줄까지 (작은 DB 디스크 IO 한도를 지키려고).
 *  - get_saved: 미리 계산해 둔 집계(TrendCache) — 막 뜨는 작품 · 플레이북 · 기회판 · 종합 분석 · 원본 채널 순위 등.
 *
 * 대화 기록은 브라우저가 들고 있다가 매번 텍스트만 보낸다 (도구 호출 내역은 그 질문 안에서만).
 */

import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { CLAUDE_MODEL, claudeClient, costKrwOf, explainClaudeError, type ClaudeUsage } from '@/lib/radar/claude';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type AgentEvent =
  | { type: 'step'; text: string }
  | { type: 'answer'; text: string }
  | { type: 'done'; costKrw: number; ms: number; steps: number }
  | { type: 'error'; message: string };

const MAX_ROUNDS = 10;
const ROW_LIMIT = 200;
const RESULT_CHARS = 30_000;
const READER_ROLE = 'dashboard_agent_reader';

const SYSTEM = `너는 「새로이 대시보드」의 데이터 도우미다. 운영자는 한국 유튜브 쇼츠 채널(드라마·영화·예능 클립, 연예 이슈, 아이돌 팬튜브, 시니어 쇼츠 등)을 여러 개 운영하고, 이 대시보드로 경쟁 채널을 감시한다(꿀통레이더).
운영자의 질문에 대시보드 DB 와 미리 계산해 둔 집계로 답한다. 도구로 실제 숫자를 확인하고 답하라 — 숫자를 지어내지 마라. 자료가 없으면 없다고 말하라.

## 도구
- get_saved(key, path, purpose): 미리 계산해 둔 집계를 읽는다. 무겁지 않으니 맞는 저장본이 있으면 이걸 먼저.
- sql_query(sql, purpose): 읽기 전용 SELECT 하나. 한 번에 최대 200줄, 20초. 비밀 표(API 키 · OAuth 토큰 · Todoist 토큰)는 권한이 없어 못 읽는다 — 키·토큰을 물으면 대시보드 설정 화면에서 보라고 안내하라.
- purpose 는 운영자 화면에 진행 상황으로 보인다 — 「채널팩별 하루 조회 합 보는 중」처럼 짧은 한국어로.

## 표 (PostgreSQL, 이름은 큰따옴표: "Channel", 열도 "dailyViews")
시각은 UTC 로 저장된다 (timestamp). 한국 시각은 ("publishedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul'). 지금은 NOW().
- "Folder": 채널팩. id, name(팩 이름, 예: 영드짜 · 한국 예능 · 아이돌 팬튜브 · 정치 | 보수), watched(관심 목록 — 매시간 잰다).
  메타 팩(채널을 모아 둔 보관함, 분석에서 보통 뺀다): 넘사 · 고래 · No양산형 · 주제 자주 변경 · 제외 · 대기업 · 방송사 채널팩 · 뉴스공식 · 저작권ㄱㅊ? · 이름이 __ 로 시작하는 것.
- "Channel": 감시 채널 (유튜브). id, externalId(UC…, 링크 https://www.youtube.com/channel/<externalId>), displayName, handle, folderId → "Folder".id, isActive(꺼진 채널은 빼고 본다),
  subscriberCount, totalViewCount, dailyViews(하루 조회 — 최근 3일 증가 기준), dailyViewsPrev(그 전), weekViews, monthViews, videoCount, lastUploadAt, channelCreatedAt,
  baselineMedian(평소 영상 조회 중앙값 — 7~30일 된 영상), contentFormat(shorts · long · hybrid), layout(쇼츠 화면 구성: insta=인스타형 · titlebar=일반형 제목바 · full · split · text · talk · ai · ranking · other), layoutTags, koRatio(제목 한글 비율).
  한국어 채널 = ("displayName" ~ '[가-힣]' OR "koRatio" >= 0.3). 운영자는 한국 시장을 보니 따로 말이 없으면 한국어 채널 기준으로 답하라.
- "RadarVideo": 감시 채널 영상 (최근 35일 · 약 56만 줄 · 330MB — 무겁다). id(유튜브 영상 id, 링크 https://www.youtube.com/shorts/<id>), channelId → "Channel".id, title, publishedAt, durationSec, isShorts, views, likes, comments, tags(text[]), descTags,
  gain1h · gain3h · gain6h · gain12h · gain24h · gain48h(그 시간 동안 조회 증가), checkedAt(마지막으로 잰 시각), workId → "RadarWork".id(작품 인식), matchedBy(작품을 붙인 말).
  반드시 publishedAt 을 좁혀라(7일 이하 권장) 또는 channelId · workId 로 좁혀라. 영상 전체를 훑는 쿼리는 20초에 끊기고 DB 를 느리게 한다.
- "RadarHot": 터진 영상 미리 계산 (매시 9분 갱신). format(shorts|long), win(6|24|48 시간), videoId → "RadarVideo".id, rate(시간당 조회 — 정렬용), gain, views, publishedAt, checkedAt, fresh4, channelId. 「지금 터진 영상」은 여기부터 (win 과 format 으로 거르고 rate 순).
- "RadarWork": 작품(TMDB). id('tv:1234' | 'movie:5678'), title, year, category(kr_drama · kr_movie · kr_variety · intl_drama · intl_movie · intl_variety), networks(방송사·OTT), onAir, firstAirDate, lastEpisodeAt, nextEpisodeAt, popularity, cast(json [{id,name,character,order}]).
- "RadarPerson": 배우. id, name, credits(json 출연작). "RadarAlias": 해시태그·말 → 작품/인물 (alias, workId, personId, blocked).
- "PastHit": 업로드가 끊겨 지운 채널의 100만+ 과거 영상 (channelExternalId, channelName, folder, title, publishedAt, views, isShorts, workId). "ArchivedChannel": 지운 채널.
- "RadarCandidate": 신규 발굴 후보 채널 (externalId, title, subscriberCount, viewCount, videoCount, channelCreatedAt, status, qualifiedBy='대박 신생'|'최근 잘 나옴', sampleVideos json).
- "KeywordVolume": 네이버 월 검색수 (keyword, pc, mobile, fetchedAt).
- "MyChannel": 운영자 본인 채널. name, platform(YOUTUBE · TIKTOK · INSTAGRAM · THREADS · NAVER_CLIP …), url, category, adsense(애드센스 계정), email, profile(멀티로그인 프로필 번호), monetizationStatus(PRE_MONETIZATION · MONETIZED · UNKNOWN), isActive, tiktokUrl.
- "ScheduledVideo": 업로드 예약. channelId → "MyChannel".id, title, scheduledAt, status, publishedUrl.
- "TrendCache": 미리 계산 저장본 (key, payload json, fetchedAt). get_saved 로 읽어라.

## 저장본 (get_saved 의 key)
- radar:works:v4:3d (또는 :24h · :7d — 열어 본 적 있을 때만 있음): 막 뜨는 작품 화면. rising[](title, category, recentShorts, channels, recentViews, related…), crowded[], sources[](작품이 나온 팩).
- radar:playbook:v2: 플레이북 — mass[](구독 8만 이하 양산형 채널 하루 조회 순 + 화면 구성 · 순위 변화), formats[](팩별 59초 · 미드폼 · 롱폼 성과), revival[](부활 작품), templates[](팩별 화면 구성 신호).
- radar:outlook:v4:kr (한국어 채널) · radar:outlook:v4:all: 기회판 — 팩별 점수 · 오름세 · 신생 성공률 · 상위 3채널 비중 · 대박 신생.
- radar:brief: 마지막 AI 종합 분석 결과 (result 안에 요약 · 카테고리 · 키워드 · 플레이북 · 오늘 할 일). radar:brief-input: 그 분석에 넣은 자료(인물 · 작품 · 키워드 · 팩 열기 · 공개 예정 …).
- radar:golden: 황금키워드 (네이버 검색수 ÷ 7일 쇼츠 수). radar:sources: 원본 채널 레이더 (스케치 원본 · 유튜브 예능 — 짜깁기 클립 수 · 조회 · 24시간 증가).
- radar:insight:<화면>:…: 탭별 AI 분석 결과 (예: radar:insight:rising:3d:all, radar:insight:hot:hot:shorts:24). radar:pack-plan: 팩별 검색어 계획.
- radar:last-collect · radar:last-maint · radar:last-precompute: 수집기 · 정비 · 미리 계산 마지막 결과.
- radar:airing:<날짜> · radar:season:<날짜> · radar:upcoming:<날짜>: 편성 · 시즌 · 공개 예정. google-rss-history:KR: 구글 급상승 기록.
path 로 안쪽만 꺼낼 수 있다 (예: ["rising"], ["result","todo"]). 배열은 앞 40개까지만 온다.

## 답하는 법
- 한국어로 짧고 단정하게. 결론부터, 그다음 근거 숫자.
- 숫자는 읽기 쉽게 (1,234,567 → 123만). 표가 낫으면 마크다운 표로 (15줄 이하).
- 어떤 자료로 셌는지 한 줄 (예: 「RadarVideo 최근 7일 · 한국어 채널 기준」). 저장본이면 언제 계산된 것인지도.
- 영상·채널을 말할 때는 이름과 링크를 같이.
- 쿼리가 끊기거나 틀리면 더 좁혀서 다시 시도하라. 같은 쿼리를 그대로 반복하지 마라.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'sql_query',
    description:
      '대시보드 DB 에 읽기 전용 SELECT(또는 WITH … SELECT) 하나를 돌려 결과 줄을 JSON 으로 받는다. 최대 200줄 · 20초. 큰 표("RadarVideo")는 반드시 publishedAt · channelId · workId 로 좁힐 것.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'PostgreSQL SELECT 문 하나 (세미콜론 없이). 표·열 이름은 큰따옴표.' },
        purpose: { type: 'string', description: '무엇을 보려는지 — 운영자 화면에 진행 상황으로 보인다 (짧은 한국어)' },
      },
      required: ['sql', 'purpose'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_saved',
    description: '미리 계산해 둔 집계(TrendCache)를 key 로 읽는다. path 로 안쪽 값만 꺼낼 수 있다 (없으면 빈 배열). 계산 시각(fetchedAt)이 같이 온다.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: "저장본 key (예: 'radar:playbook:v2'). '*' 로 끝나면 그 접두어로 시작하는 key 목록을 준다" },
        path: { type: 'array', items: { type: 'string' }, description: '꺼낼 안쪽 경로 (예: ["rising"]). 전부면 []' },
        purpose: { type: 'string', description: '무엇을 보려는지 — 운영자 화면에 진행 상황으로 보인다 (짧은 한국어)' },
      },
      required: ['key', 'path', 'purpose'],
      additionalProperties: false,
    },
    strict: true,
  },
];

/** BigInt · Date 를 JSON 으로 — 큰 수는 문자열 */
function jsonSafe(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (typeof x === 'bigint') return Number.isSafeInteger(Number(x)) ? Number(x) : x.toString();
    return x;
  });
}

function clip(text: string): string {
  return text.length > RESULT_CHARS ? `${text.slice(0, RESULT_CHARS)}\n…(잘림 — 더 좁혀서 다시 물어볼 것)` : text;
}

/** 읽기 전용 · 비밀 표 권한 없는 역할로 한 문장만 */
async function runSql(sql: string): Promise<string> {
  const body = sql.trim().replace(/;\s*$/, '');
  const head = body.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)+/, '');
  if (!/^(select|with)\b/i.test(head)) return '오류: SELECT 또는 WITH 로 시작하는 읽기 쿼리만 됩니다.';
  if (body.includes(';')) return '오류: 쿼리는 한 문장만 (세미콜론 없이).';
  if (body.length > 8000) return '오류: 쿼리가 너무 깁니다 (8,000자까지).';
  try {
    const rows = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${READER_ROLE}`);
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '20s'");
        return tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM (${body}) AS q LIMIT ${ROW_LIMIT + 1}`);
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
    const more = rows.length > ROW_LIMIT;
    return clip(jsonSafe({ rows: rows.slice(0, ROW_LIMIT), rowCount: Math.min(rows.length, ROW_LIMIT), truncated: more }));
  } catch (e) {
    const msg = (e as Error).message.replace(/\s+/g, ' ');
    const m = msg.match(/Message: `([^`]+)`/);
    return `오류: ${(m ? m[1] : msg).slice(0, 400)}`;
  }
}

/** 배열은 앞 40개만 (저장본이 커서) */
function trimArrays(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => trimArrays(x, depth + 1));
  if (v && typeof v === 'object' && depth < 6) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trimArrays(x, depth + 1)]));
  return v;
}

async function getSaved(key: string, path: string[]): Promise<string> {
  if (key.endsWith('*')) {
    const prefix = key.slice(0, -1);
    const rows = await prisma.trendCache.findMany({
      where: { key: { startsWith: prefix } },
      select: { key: true, fetchedAt: true },
      orderBy: { fetchedAt: 'desc' },
      take: 60,
    });
    return jsonSafe(rows.map((r) => ({ key: r.key, fetchedAt: r.fetchedAt.toISOString() })));
  }
  // 작업 상태(job:*) 같은 내부 기록도 읽기만 — 비밀은 TrendCache 에 두지 않는다
  const row = await prisma.trendCache.findUnique({ where: { key } }).catch(() => null);
  if (!row) return `없음: '${key}' 저장본이 없습니다. 접두어 뒤에 * 를 붙여 목록을 보세요 (예: 'radar:works:*').`;
  let v: unknown = row.payload;
  for (const p of path) {
    if (v && typeof v === 'object') v = (v as Record<string, unknown>)[p];
    else {
      v = undefined;
      break;
    }
  }
  return clip(jsonSafe({ key, fetchedAt: row.fetchedAt.toISOString(), value: trimArrays(v) ?? null }));
}

async function runTool(name: string, input: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  if (name === 'sql_query' && typeof input.sql === 'string') {
    const text = await runSql(input.sql);
    return { text, isError: text.startsWith('오류:') };
  }
  if (name === 'get_saved' && typeof input.key === 'string') {
    const path = Array.isArray(input.path) ? input.path.filter((p): p is string => typeof p === 'string') : [];
    return { text: await getSaved(input.key, path), isError: false };
  }
  return { text: `오류: 모르는 도구이거나 입력이 맞지 않습니다 (${name})`, isError: true };
}

/** 대화 한 번 — 진행 상황 · 답 · 비용을 send 로 흘려보낸다 */
export async function runAgent(o: { history: ChatTurn[]; page: string | null; send: (e: AgentEvent) => void }): Promise<void> {
  const t0 = Date.now();
  const { client, workspaceId } = await claudeClient(120_000);
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  // 바뀌는 정보(지금 시각 · 보고 있는 화면)는 시스템 지시가 아니라 마지막 질문에 붙인다 — 시스템 · 도구 캐시가 깨지지 않게
  const turns = o.history.slice(-12);
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t, i) => ({
    role: t.role,
    content: i === turns.length - 1 && t.role === 'user' ? `[지금 ${now} · 보고 있는 화면 ${o.page ?? '알 수 없음'}]\n${t.content}` : t.content,
  }));
  const usage: ClaudeUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let steps = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        // 안전 분류기가 거절하면 서버가 알맞은 다른 모델로 다시 돌린다
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        // 도구를 여러 번 부르는 동안 앞선 대화도 캐시에서 읽게
        cache_control: { type: 'ephemeral' },
        messages,
      });
    } catch (e) {
      throw explainClaudeError(e, workspaceId);
    }
    const u = response.usage;
    usage.input += u.input_tokens;
    usage.output += u.output_tokens;
    usage.cacheRead += u.cache_read_input_tokens ?? 0;
    usage.cacheWrite += u.cache_creation_input_tokens ?? 0;

    if (response.stop_reason === 'refusal') throw new Error('Claude 가 이 질문에 답하기를 거절했습니다');
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    if (response.stop_reason === 'max_tokens') {
      o.send({ type: 'answer', text: `${text}\n\n(답이 길어 여기서 잘렸습니다 — 범위를 좁혀 다시 물어 주세요)` });
      break;
    }
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !calls.length) {
      o.send({ type: 'answer', text: text || '(답이 비었습니다 — 다시 물어 주세요)' });
      break;
    }
    // 도구 결과는 모두 한 메시지로 돌려준다 (나눠 보내면 병렬 호출을 덜 하게 된다)
    messages.push({ role: 'assistant', content: response.content });
    const results = await Promise.all(
      calls.map(async (c) => {
        const input = (c.input ?? {}) as Record<string, unknown>;
        steps++;
        o.send({ type: 'step', text: typeof input.purpose === 'string' && input.purpose ? input.purpose : c.name });
        const r = await runTool(c.name, input);
        return { type: 'tool_result' as const, tool_use_id: c.id, content: r.text, is_error: r.isError };
      })
    );
    messages.push({ role: 'user', content: results });
    if (round === MAX_ROUNDS - 1) o.send({ type: 'answer', text: '(조회를 너무 여러 번 해서 멈췄습니다 — 질문을 좁혀 다시 물어 주세요)' });
  }
  o.send({ type: 'done', costKrw: costKrwOf(usage), ms: Date.now() - t0, steps });
}
