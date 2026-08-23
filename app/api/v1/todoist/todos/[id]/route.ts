import { NextResponse } from 'next/server';
import { updateTodo, completeTodo, deleteTodo } from '@/lib/todoist';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    // 체크는 수정이 아니라 완료 처리 — Todoist 쪽에서 별도 엔드포인트다
    if (body.completed === true) {
      await completeTodo(id);
      return NextResponse.json({ success: true });
    }
    await updateTodo(id, {
      content: typeof body.content === 'string' ? body.content.trim() : undefined,
      due: 'due' in body ? (body.due || null) : undefined,
      priority: typeof body.priority === 'number' ? body.priority : undefined,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'UPDATE_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    await deleteTodo(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DELETE_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
