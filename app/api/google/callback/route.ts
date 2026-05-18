import { NextResponse } from 'next/server';
import { exchangeCode, emailFromIdToken } from '@/lib/google/oauth';
import { fetchChannelInfo, syncChannelScheduled } from '@/lib/google/youtube';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function html(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Google 연결</title>
     <body style="font-family:system-ui;padding:48px;text-align:center;color:#0f172a">
       ${body}
     </body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function parseState(state: string | null): {
  kind: 'calendar' | 'youtube';
  myChannelId?: string;
} {
  if (!state) return { kind: 'calendar' };
  const [head, mid] = state.split(':');
  if (head === 'yt' && mid) return { kind: 'youtube', myChannelId: mid };
  return { kind: 'calendar' };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  const state = url.searchParams.get('state');
  if (err) return html(`<h2>연결 실패</h2><p>${err}</p>`, 400);
  if (!code) return html(`<h2>연결 실패</h2><p>code 없음</p>`, 400);

  const { kind, myChannelId } = parseState(state);

  try {
    const t = await exchangeCode(code);
    if (!t.refresh_token) {
      return html(
        `<h2>연결 실패</h2><p>refresh_token 이 안 옴. Google 계정 권한을 한 번 철회한 뒤 다시 시도해주세요.<br>
         (myaccount.google.com → 보안 → 타사 액세스에서 이 앱 제거)</p>`,
        400
      );
    }
    const email = emailFromIdToken(t.id_token);
    const expiresAt = new Date(Date.now() + t.expires_in * 1000);

    if (kind === 'youtube' && myChannelId) {
      let ytChannelId: string | null = null;
      let ytChannelName: string | null = null;
      try {
        const info = await fetchChannelInfo(t.access_token);
        if (info) {
          ytChannelId = info.channelId;
          ytChannelName = info.channelName;
        }
      } catch {
        /* skip */
      }

      // 같은 YouTube 채널이 이미 다른 MyChannel 에 연결돼있으면 거부
      if (ytChannelId) {
        const dup = await prisma.channelYouTubeOAuth.findFirst({
          where: { youtubeChannelId: ytChannelId, myChannelId: { not: myChannelId } },
          include: { myChannel: true },
        });
        if (dup) {
          // 새로 만든 placeholder 채널이면 정리
          const ch = await prisma.myChannel.findUnique({ where: { id: myChannelId } });
          if (ch && ch.name === '(미설정)' && !ch.url) {
            await prisma.myChannel
              .delete({ where: { id: myChannelId } })
              .catch(() => {});
          }
          return html(
            `<h2>중복된 YouTube 채널</h2>
             <p>이 YouTube 채널 (<b>${ytChannelName ?? ytChannelId}</b>) 은 이미
             "<b>${dup.myChannel?.name ?? ''}</b>" 에 연결되어 있습니다.</p>
             <p>이 창을 닫고 기존 채널을 사용해주세요.</p>
             <script>setTimeout(()=>window.close(), 2500);</script>`,
            409
          );
        }
      }

      const saved = await prisma.channelYouTubeOAuth.upsert({
        where: { myChannelId },
        create: {
          myChannelId,
          accessToken: t.access_token,
          refreshToken: t.refresh_token,
          expiresAt,
          accountEmail: email,
          youtubeChannelId: ytChannelId,
          youtubeChannelName: ytChannelName,
        },
        update: {
          accessToken: t.access_token,
          refreshToken: t.refresh_token,
          expiresAt,
          accountEmail: email,
          youtubeChannelId: ytChannelId,
          youtubeChannelName: ytChannelName,
        },
      });

      // MyChannel.name 비어있거나 '(미설정)' 이면 YouTube 채널명으로 자동 채움.
      // url 비어있고 youtubeChannelId 있으면 채널 URL 도 채움.
      if (ytChannelName || ytChannelId) {
        const ch = await prisma.myChannel.findUnique({ where: { id: myChannelId } });
        if (ch) {
          const data: { name?: string; url?: string } = {};
          if (ytChannelName && (!ch.name || ch.name === '(미설정)')) {
            data.name = ytChannelName;
          }
          if (ytChannelId && !ch.url) {
            data.url = `https://www.youtube.com/channel/${ytChannelId}`;
          }
          if (Object.keys(data).length > 0) {
            await prisma.myChannel.update({ where: { id: myChannelId }, data });
          }
        }
      }

      syncChannelScheduled(saved.id).catch((e) =>
        console.error('[yt initial sync]', e)
      );

      return html(
        `<h2>✓ YouTube 연결됨</h2>
         <p>${ytChannelName ?? email ?? ''}</p>
         <p>이 창은 닫으셔도 됩니다.</p>
         <script>setTimeout(()=>window.close(), 1500);</script>`
      );
    }

    await prisma.googleOAuth.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt,
        accountEmail: email,
        calendarId: 'primary',
      },
      update: {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt,
        accountEmail: email,
      },
    });
    return html(
      `<h2>✓ Google 캘린더 연결됨</h2>
       <p>${email ?? ''}</p>
       <p>이 창은 닫으셔도 됩니다.</p>
       <script>setTimeout(()=>window.close(), 1500);</script>`
    );
  } catch (e) {
    return html(`<h2>연결 실패</h2><pre>${(e as Error).message}</pre>`, 500);
  }
}
