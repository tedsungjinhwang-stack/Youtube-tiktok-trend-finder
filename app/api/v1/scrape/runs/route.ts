import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }
  return NextResponse.json({ success: true, data: [], meta: { total: 0 } });
}
