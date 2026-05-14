import { NextResponse } from 'next/server';
import { clearToken, getAuthStatus } from '@/lib/openai/oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await getAuthStatus();
  return NextResponse.json({ success: true, data: status });
}

export async function DELETE() {
  try {
    await clearToken();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'CLEAR_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
