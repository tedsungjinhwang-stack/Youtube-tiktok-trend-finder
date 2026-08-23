import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const IDS = ['weekly', 'monthly', 'yearly'] as const;
type PlanId = (typeof IDS)[number];

function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && (IDS as readonly string[]).includes(v);
}

/**
 * 이 저장소는 배포 때 마이그레이션을 자동으로 돌리지 않는다(build 는 prisma generate 만).
 * 테이블이 아직 없으면 500 대신 빈 값으로 내려서 화면이 깨지지 않게 한다.
 */
function isMissingTable(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /relation .* does not exist|P2021|does not exist in the current database/i.test(msg);
}

/** 세 칸을 항상 다 돌려준다 — 아직 안 쓴 칸은 빈 문자열 */
export async function GET() {
  try {
    const rows = await prisma.planNote.findMany({ where: { id: { in: [...IDS] } } });
    const byId = new Map(rows.map((r) => [r.id, r.content]));
    return NextResponse.json(
      { success: true, data: Object.fromEntries(IDS.map((id) => [id, byId.get(id) ?? ''])) },
      { headers: NO_STORE }
    );
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        {
          success: true,
          data: Object.fromEntries(IDS.map((id) => [id, ''])),
          warning: 'DB 마이그레이션 미실행 (PlanNote). 저장이 되지 않습니다.',
        },
        { headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'LIST_FAILED', message: (e as Error).message } },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!isPlanId(body.id)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_INPUT', message: 'id 는 weekly|monthly|yearly' } },
      { status: 400 }
    );
  }
  const content = typeof body.content === 'string' ? body.content : '';
  try {
    await prisma.planNote.upsert({
      where: { id: body.id },
      create: { id: body.id, content },
      update: { content },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    const missing = isMissingTable(e);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: missing ? 'NOT_MIGRATED' : 'SAVE_FAILED',
          message: missing
            ? 'PlanNote 테이블이 없습니다. DB 마이그레이션을 적용해주세요.'
            : (e as Error).message,
        },
      },
      { status: 500 }
    );
  }
}
