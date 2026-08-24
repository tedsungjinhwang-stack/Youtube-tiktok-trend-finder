import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const IDS = ['weekly', 'monthly', 'yearly'] as const;
type PlanId = (typeof IDS)[number];

function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && (IDS as readonly string[]).includes(v);
}

function isMissingTable(e: unknown): boolean {
  const msg = (e as Error)?.message ?? '';
  return /relation .* does not exist|P2021|does not exist in the current database/i.test(msg);
}

/**
 * 이 저장소는 배포 때 마이그레이션을 자동으로 돌리지 않는다(build 는 prisma generate 만).
 * 지금까지는 사람이 SQL 을 직접 넣어왔는데, 이 표는 컬럼 3개짜리라 그럴 이유가 없다.
 * 없으면 만들고 이어서 진행한다 — CREATE TABLE IF NOT EXISTS 라 여러 번 불려도 안전하고,
 * 기존 데이터를 건드리지 않는다. prisma/migrations 의 SQL 과 같은 정의다.
 */
async function ensureTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlanNote" (
      "id" TEXT NOT NULL,
      "content" TEXT NOT NULL DEFAULT '',
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "PlanNote_pkey" PRIMARY KEY ("id")
    )
  `);
}

/** 표가 없어서 실패한 거면 한 번 만들고 다시 시도한다. */
async function withTable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    await ensureTable();
    return run();
  }
}

/** 세 칸을 항상 다 돌려준다 — 아직 안 쓴 칸은 빈 문자열 */
export async function GET() {
  try {
    const rows = await withTable(() =>
      prisma.planNote.findMany({ where: { id: { in: [...IDS] } } })
    );
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
    await withTable(() =>
      prisma.planNote.upsert({
        where: { id: body.id },
        create: { id: body.id, content },
        update: { content },
      })
    );
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
