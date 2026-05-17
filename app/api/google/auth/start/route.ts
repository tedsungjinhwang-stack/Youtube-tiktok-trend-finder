import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/google/oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const state = Math.random().toString(36).slice(2);
    const url = buildAuthUrl(state);
    return NextResponse.json({ success: true, data: { url, state } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_URL_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
