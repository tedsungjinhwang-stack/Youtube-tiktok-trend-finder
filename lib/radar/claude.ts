/**
 * 꿀통레이더 공용 Claude 호출 — 키·워크스페이스 헤더·오류 안내·비용 계산을 한 곳에서.
 * 결과는 JSON 텍스트로 받는다 (결과 모양이 커서 structured outputs 문법 한도를 넘기 때문).
 */

import Anthropic from '@anthropic-ai/sdk';
import { readSecret } from '@/lib/trends/cache';

export const CLAUDE_MODEL = 'claude-opus-5-5';
/** 원/달러 어림 (비용 표시용) */
const USD_KRW = 1400;
/** claude-opus-5-5 $/1M 토큰 */
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

export class NoClaudeKeyError extends Error {
  constructor() {
    super('Claude API 키가 없습니다 — 설정 → API 키에서 「Claude API」를 넣어 주세요');
    this.name = 'NoClaudeKeyError';
  }
}

export async function hasClaudeKey(): Promise<boolean> {
  return !!(await readSecret('ANTHROPIC_API_KEY'));
}

export type ClaudeUsage = { input: number; output: number; cacheRead: number; cacheWrite: number };

/** 시스템 지시 + 사용자 글 → 텍스트, 쓴 토큰, 원화 비용. 오류는 알아듣게 바꿔 던진다 */
export async function askClaude(o: {
  system: string;
  /** 글 하나, 또는 이미지·글 블록 (썸네일 분류) */
  user: string | Anthropic.Beta.BetaContentBlockParam[];
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
  timeoutMs?: number;
}): Promise<{ text: string; model: string; usage: ClaudeUsage; costKrw: number }> {
  const apiKey = await readSecret('ANTHROPIC_API_KEY');
  if (!apiKey) throw new NoClaudeKeyError();
  // 워크스페이스에 묶이지 않은 키는 어느 워크스페이스로 부를지 헤더로 알려야 한다
  const workspaceId = await readSecret('ANTHROPIC_WORKSPACE_ID');
  const client = new Anthropic({
    apiKey,
    timeout: o.timeoutMs ?? 280_000,
    maxRetries: 1,
    ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
  });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: o.maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      // 안전 분류기가 거절하면 서버가 알맞은 다른 모델로 다시 돌린다
      fallbacks: 'default',
      output_config: { effort: o.effort },
      system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: o.user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('Claude API 키가 맞지 않습니다 — 설정 → API 키에서 다시 넣어 주세요');
    if (e instanceof Anthropic.BadRequestError && /workspace/i.test(e.message)) {
      throw new Error(
        workspaceId
          ? 'Claude 워크스페이스 ID가 맞지 않습니다 — 설정 → API 키의 「Claude 워크스페이스 ID」(wrkspc_…)를 확인해 주세요'
          : '이 키는 워크스페이스를 정해 줘야 합니다 — 설정 → API 키의 「Claude 워크스페이스 ID」에 wrkspc_… 값을 넣거나, 워크스페이스 안에서 만든 키를 써 주세요'
      );
    }
    if (e instanceof Anthropic.RateLimitError) throw new Error('Claude 호출 한도에 걸렸습니다 — 잠시 뒤 다시 시도해 주세요');
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new Error('Claude 가 이 자료의 분석을 거절했습니다');
  if (response.stop_reason === 'max_tokens') throw new Error('답이 너무 길어 잘렸습니다 — 다시 시도해 주세요');
  const u = response.usage;
  const usage = {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
  const usd = (usage.input * PRICE.input + usage.output * PRICE.output + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) / 1_000_000;
  return {
    text: response.content.map((b) => (b.type === 'text' ? b.text : '')).join(''),
    model: response.model,
    usage,
    costKrw: Math.round(usd * USD_KRW),
  };
}

/** 텍스트에서 첫 { 부터 마지막 } 까지 JSON 으로 (코드 블록으로 감싸 와도) */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
