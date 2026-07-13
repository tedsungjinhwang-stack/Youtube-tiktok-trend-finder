import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { testTodoistToken } from '@/lib/todoist';

export const dynamic = 'force-dynamic';

function missingTable(e: unknown) {
  return /relation .* does not exist|P2021|does not exist/i.test((e as Error)?.message ?? '');
}

export async function GET() {
  try {
    const c = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
    return NextResponse.json({
      success: true,
      data: c
        ? {
            connected: true,
            account: c.accountName,
            projectName: c.projectName,
            lastSyncedAt: c.lastSyncedAt,
            lastSyncError: c.lastSyncError,
          }
        : { connected: false },
    });
  } catch (e) {
    if (missingTable(e)) return NextResponse.json({ success: true, data: { connected: false, warning: 'DB 마이그레이션 미실행 (TodoistConfig)' } });
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: (e as Error).message } }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = (body.apiToken ?? '').toString().trim();
  if (!token) {
    return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'apiToken 필요' } }, { status: 400 });
  }
  const test = await testTodoistToken(token);
  if (!test.ok) {
    return NextResponse.json({ success: false, error: { code: 'INVALID_TOKEN', message: test.error ?? '토큰 검증 실패' } }, { status: 400 });
  }
  try {
    await prisma.todoistConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', apiToken: token, accountName: test.account ?? null },
      update: { apiToken: token, accountName: test.account ?? null, lastSyncError: null },
    });
    return NextResponse.json({ success: true, data: { connected: true, account: test.account } });
  } catch (e) {
    if (missingTable(e)) {
      return NextResponse.json({ success: false, error: { code: 'NO_TABLE', message: 'DB 마이그레이션 필요 (TodoistConfig)' } }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: (e as Error).message } }, { status: 500 });
  }
}

// 프로젝트명 변경 — projectId 를 비워서 다음 sync 때 그 이름의 기존 프로젝트를 찾아 연결.
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectName = (body.projectName ?? '').toString().trim();
  if (!projectName) {
    return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'projectName 필요' } }, { status: 400 });
  }
  try {
    const updated = await prisma.todoistConfig.update({
      where: { id: 'default' },
      data: { projectName, projectId: null },
    });
    return NextResponse.json({ success: true, data: { projectName: updated.projectName } });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'P2025') return NextResponse.json({ success: false, error: { code: 'NOT_CONNECTED', message: 'Todoist 미연결' } }, { status: 400 });
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: (e as Error).message } }, { status: 500 });
  }
}

export async function DELETE() {
  await prisma.todoistConfig.deleteMany({ where: { id: 'default' } }).catch(() => {});
  return NextResponse.json({ success: true });
}
