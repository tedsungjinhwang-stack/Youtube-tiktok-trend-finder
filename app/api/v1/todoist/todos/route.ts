import { NextResponse } from 'next/server';
import { listTodos, createTodo } from '@/lib/todoist';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    return NextResponse.json({ success: true, data: await listTodos() }, { headers: NO_STORE });
  } catch (e) {
    const message = (e as Error).message;
    // 미연결은 오류가 아니라 '아직 안 붙임' 상태다. 화면에서 안내를 띄우도록 구분해 준다.
    const notConnected = message.includes('미연결');
    return NextResponse.json(
      { success: false, error: { code: notConnected ? 'NOT_CONNECTED' : 'LIST_FAILED', message } },
      { status: notConnected ? 200 : 500, headers: NO_STORE }
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) {
    return NextResponse.json(
      { success: false, error: { code: 'EMPTY', message: '할 일 내용을 입력해주세요.' } },
      { status: 400 }
    );
  }
  try {
    const todo = await createTodo({
      content,
      due: typeof body.due === 'string' && body.due ? body.due : null,
      dueAt: typeof body.dueAt === 'string' && body.dueAt ? body.dueAt : null,
      priority: typeof body.priority === 'number' ? body.priority : undefined,
    });
    return NextResponse.json({ success: true, data: todo });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'CREATE_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
