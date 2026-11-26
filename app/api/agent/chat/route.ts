import { z } from 'zod';
import { runAgent, type AgentEvent } from '@/lib/agent/chat';

export const dynamic = 'force-dynamic';
// 도구를 여러 번 부르면 1~3분 — 함수 한도 안에서
export const maxDuration = 300;

/**
 * 대시보드 AI 채팅 — 진행 상황 · 답을 줄 단위 JSON(NDJSON)으로 흘려보낸다.
 * 사이트 비밀번호(middleware)를 통과한 사람만 부를 수 있다 (/api/agent 는 예외 목록에 없다).
 */
const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
  page: z.string().max(200).nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages[parsed.data.messages.length - 1].role !== 'user') {
    return Response.json({ ok: false, error: '질문 형식이 맞지 않습니다' }, { status: 400 });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + '\n'));
      try {
        await runAgent({ history: parsed.data.messages, page: parsed.data.page ?? null, send });
      } catch (e) {
        send({ type: 'error', message: (e as Error).message.slice(0, 300) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
