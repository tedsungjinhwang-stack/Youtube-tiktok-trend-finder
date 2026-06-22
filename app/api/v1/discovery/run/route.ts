import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { collectAndSave } from '@/lib/discovery/save';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 디스커버리 수동 수집. 로그인된 브라우저(쿠키) 또는 Bearer 키로 인증. */
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED' } },
      { status: 401 }
    );
  }

  try {
    const result = await collectAndSave();
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    return NextResponse.json(
      { success: false, error: { code: 'RUN_FAILED', message: msg } },
      { status: 500 }
    );
  }
}
