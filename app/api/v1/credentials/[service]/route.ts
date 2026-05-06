import { NextRequest, NextResponse } from 'next/server';
import { CRED_META, type CredService, clearCred } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { service: string } }
) {
  const service = params.service as CredService;
  if (!(service in CRED_META)) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Unknown service' } },
      { status: 404 }
    );
  }
  try {
    await clearCred(service);
    return NextResponse.json({ success: true, data: { service } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_EDITABLE', message: (e as Error).message } },
      { status: 400 }
    );
  }
}
