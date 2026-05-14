import { NextRequest, NextResponse } from 'next/server';
import { pollToken, storeToken } from '@/lib/openai/oauth';

export const dynamic = 'force-dynamic';

/** Device code 로 토큰 폴링. body: { device_code }. */
export async function POST(req: NextRequest) {
  let body: { device_code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY' } },
      { status: 400 }
    );
  }
  if (!body.device_code) {
    return NextResponse.json(
      { success: false, error: { code: 'MISSING_DEVICE_CODE' } },
      { status: 400 }
    );
  }

  try {
    const r = await pollToken(body.device_code);
    if (r.status === 'ok' && r.token) {
      // 토큰 받았으면 저장. account email 은 id token 디코딩 가능하나 단순화: null.
      await storeToken(r.token);
      return NextResponse.json({ success: true, data: { status: 'ok' } });
    }
    return NextResponse.json({
      success: true,
      data: { status: r.status, error: r.error ?? null },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'POLL_FAILED', message: (e as Error).message } },
      { status: 502 }
    );
  }
}
