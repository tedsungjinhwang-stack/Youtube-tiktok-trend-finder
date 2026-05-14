import { NextResponse } from 'next/server';
import { requestDeviceCode } from '@/lib/openai/oauth';

export const dynamic = 'force-dynamic';

/** Device code 발급. UI 가 user_code 와 verification_uri 표시 후, /poll 로 폴링. */
export async function POST() {
  try {
    const r = await requestDeviceCode();
    return NextResponse.json({
      success: true,
      data: {
        device_code: r.device_code,
        user_code: r.user_code,
        verification_uri: r.verification_uri,
        verification_uri_complete: r.verification_uri_complete ?? null,
        expires_in: r.expires_in,
        interval: r.interval,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'DEVICE_CODE_FAILED', message: (e as Error).message } },
      { status: 502 }
    );
  }
}
