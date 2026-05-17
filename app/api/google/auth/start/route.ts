import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/google/oauth';

export const dynamic = 'force-dynamic';

/**
 * Google OAuth start.
 * - 캘린더용:  /api/google/auth/start
 * - YouTube용: /api/google/auth/start?kind=youtube&channelId=<MyChannel.id>
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind');
    const myChannelId = url.searchParams.get('channelId');
    const rand = Math.random().toString(36).slice(2);

    if (kind === 'youtube') {
      if (!myChannelId) {
        return NextResponse.json(
          { success: false, error: { code: 'BAD_INPUT', message: 'channelId 필수' } },
          { status: 400 }
        );
      }
      const state = `yt:${myChannelId}:${rand}`;
      const consentUrl = buildAuthUrl(state, { kind: 'youtube' });
      return NextResponse.json({ success: true, data: { url: consentUrl, state } });
    }

    const state = `cal:${rand}`;
    const consentUrl = buildAuthUrl(state, { kind: 'calendar' });
    return NextResponse.json({ success: true, data: { url: consentUrl, state } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_URL_FAILED', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
