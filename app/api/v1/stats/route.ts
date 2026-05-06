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

  // Mock until DB connected.
  return NextResponse.json({
    success: true,
    data: {
      folders: 19,
      channels: 0,
      videos: 0,
      lastScrapeAt: null,
    },
  });
}
