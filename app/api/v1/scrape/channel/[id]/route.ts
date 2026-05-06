import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }
  // Mock — Phase 2 wires lib/scraper/index.ts.
  return NextResponse.json({
    success: true,
    data: {
      runId: `mock-run-${Date.now()}`,
      channelId: params.id,
      status: 'QUEUED',
    },
  });
}
