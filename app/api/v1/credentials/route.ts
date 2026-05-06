import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CRED_META,
  type CredService,
  listCredStatus,
  setCred,
} from '@/lib/credentials';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await listCredStatus();
  return NextResponse.json({ success: true, data: status });
}

const PutSchema = z.object({
  service: z.enum(Object.keys(CRED_META) as [CredService, ...CredService[]]),
  value: z.string().min(1).max(2000),
});

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: parsed.error.message } },
      { status: 400 }
    );
  }
  try {
    await setCred(parsed.data.service, parsed.data.value);
    return NextResponse.json({ success: true, data: { service: parsed.data.service } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_EDITABLE', message: (e as Error).message } },
      { status: 400 }
    );
  }
}
