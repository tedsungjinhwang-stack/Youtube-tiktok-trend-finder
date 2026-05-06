import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/auth';
import { scrapeAllActive } from '@/lib/scraper';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Bearer token required' } },
      { status: 401 }
    );
  }
  try {
    const result = await scrapeAllActive();
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'SCRAPE_FAILED', message: (e as Error).message },
      },
      { status: 500 }
    );
  }
}
