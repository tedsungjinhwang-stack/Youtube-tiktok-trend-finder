/**
 * Google Calendar API 헬퍼.
 *
 * 정책: **채널당 1개 이벤트** (개별 영상마다 X).
 *   - 이벤트 제목: `{channelName} ({videoCount})`
 *   - 이벤트 시각: 그 채널의 가장 마지막 예약 영상의 scheduledAt
 *   - 영상 0개면 이벤트 삭제
 */

import { getValidAccessToken } from './oauth';
import { prisma } from '@/lib/db';

const API = 'https://www.googleapis.com/calendar/v3';

async function call(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Google 캘린더 연결 없음');
  const doFetch = (tok: string) =>
    fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const res = await doFetch(token);
  // 캐시된 token 이 죽어있으면 401 — 강제 refresh 후 1회 재시도
  if (res.status === 401) {
    const fresh = await getValidAccessToken({ force: true });
    if (!fresh) throw new Error('Google 캘린더 연결 만료 (refresh 실패) — /my-schedule 에서 재연결 필요');
    return doFetch(fresh);
  }
  return res;
}

function calendarPath(calendarId: string) {
  return `/calendars/${encodeURIComponent(calendarId)}/events`;
}

type EventInput = {
  calendarId: string;
  title: string;
  /** 시각 기반 (영상 예약시) */
  startISO?: string;
  durationMinutes?: number;
  /** 종일 (YYYY-MM-DD, KST). 있으면 startISO 무시 */
  allDayDate?: string;
  notes?: string;
};

function buildEventBody(e: EventInput) {
  if (e.allDayDate) {
    const startStr = e.allDayDate;
    const endDate = new Date(`${startStr}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const endStr = endDate.toISOString().slice(0, 10);
    return {
      summary: e.title,
      description: e.notes || undefined,
      start: { date: startStr },
      end: { date: endStr },
    };
  }
  const start = new Date(e.startISO!);
  const end = new Date(start.getTime() + (e.durationMinutes ?? 30) * 60_000);
  return {
    summary: e.title,
    description: e.notes || undefined,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Seoul' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Seoul' },
  };
}

async function createEvent(e: EventInput): Promise<string> {
  const r = await call('POST', calendarPath(e.calendarId), buildEventBody(e));
  if (!r.ok) throw new Error(`이벤트 생성 실패 (${r.status}): ${await r.text()}`);
  const j = (await r.json()) as { id: string };
  return j.id;
}

async function updateEvent(eventId: string, e: EventInput): Promise<void> {
  const r = await call(
    'PATCH',
    `${calendarPath(e.calendarId)}/${encodeURIComponent(eventId)}`,
    buildEventBody(e)
  );
  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 404 || r.status === 410)
      throw new Error(`404/410: ${txt.slice(0, 80)}`);
    throw new Error(`이벤트 수정 실패 (${r.status}): ${txt}`);
  }
}

async function deleteEvent(eventId: string, calendarId: string): Promise<void> {
  const r = await call(
    'DELETE',
    `${calendarPath(calendarId)}/${encodeURIComponent(eventId)}`
  );
  if (!r.ok && r.status !== 404 && r.status !== 410)
    throw new Error(`이벤트 삭제 실패 (${r.status}): ${await r.text()}`);
}

/**
 * 채널명으로 캘린더에서 기존 이벤트 검색. 우리 포맷
 * ("{채널명} / ..." 또는 "{채널명}, 영상업로드 필요") 만 매칭.
 * 최근 60일 ~ 이후 1년 범위에서 검색.
 */
async function findExistingChannelEvents(
  calendarId: string,
  channelName: string
): Promise<string[]> {
  const token = await getValidAccessToken();
  if (!token) return [];
  const timeMin = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const params = new URLSearchParams({
    q: channelName,
    timeMin,
    timeMax,
    singleEvents: 'true',
    maxResults: '50',
  });
  const list = (tok: string) =>
    fetch(`${API}${calendarPath(calendarId)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
  let r = await list(token);
  if (r.status === 401) {
    const fresh = await getValidAccessToken({ force: true });
    if (!fresh) return [];
    r = await list(fresh);
  }
  if (!r.ok) return [];
  const j = (await r.json()) as { items?: Array<{ id: string; summary?: string }> };
  const items = j.items ?? [];
  return items
    .filter((it) => {
      const s = it.summary ?? '';
      return (
        s.startsWith(`${channelName} / `) ||
        s.startsWith(`${channelName}, `) ||
        s.startsWith(`${channelName}(`) ||
        s.startsWith(`${channelName} (`) ||
        s.startsWith(`${channelName} 영상업로드`) ||
        s === channelName
      );
    })
    .map((it) => it.id);
}

export async function syncMyChannel(channelId: string): Promise<void> {
  const auth = await prisma.googleOAuth.findUnique({ where: { id: 'default' } });
  if (!auth) return;

  // 예약 일시가 이미 지난 영상은 자동 제거 (업로드 완료된 것으로 간주).
  // → 마지막 예약이 과거였던 채널은 자동으로 '영상업로드 필요' 상태로 전환됨.
  await prisma.scheduledVideo
    .deleteMany({
      where: { channelId, scheduledAt: { lt: new Date() } },
    })
    .catch(() => {});

  const ch = await prisma.myChannel.findUnique({
    where: { id: channelId },
    include: {
      videos: { orderBy: { scheduledAt: 'desc' }, take: 1 },
      _count: { select: { videos: true } },
    },
  });
  if (!ch) return;

  // 비활성 채널: 기존 이벤트 그대로 두고 그냥 스킵 (다시 활성화하면 재개)
  if (!ch.isActive) return;

  const count = ch._count.videos;
  const latest = ch.videos[0];

  let input: EventInput;
  if (count === 0 || !latest) {
    // 예약 영상 0개 → 오늘 종일로 "영상업로드 필요" 알림
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(kstNow.getUTCDate()).padStart(2, '0')}`;
    input = {
      calendarId: auth.calendarId,
      title: ch.category
        ? `${ch.name}(${ch.category}) 영상업로드 필요`
        : `${ch.name} 영상업로드 필요`,
      allDayDate: today,
      notes: '예약된 영상이 없습니다',
    };
  } else {
    // 제목: "채널명(카테고리)" — 시각은 이벤트 자체에 들어있어서 중복 표기 안 함.
    const titleStr = ch.category ? `${ch.name}(${ch.category})` : ch.name;
    input = {
      calendarId: auth.calendarId,
      title: titleStr,
      startISO: latest.scheduledAt.toISOString(),
      notes: `예약 영상 ${count}개${latest.title ? `. 마지막: ${latest.title}` : ''}`,
    };
  }

  // 중복 정리: 캘린더에서 이 채널명으로 시작하는 기존 이벤트 모두 찾아냄.
  // 호출자(cron) 가 에러를 받아 실패 카운트에 반영할 수 있도록 try/catch 제거.
  let existingIds: string[] = [];
  try {
    existingIds = await findExistingChannelEvents(auth.calendarId, ch.name);
  } catch {
    /* list 실패해도 createEvent 는 계속 시도 — 거기서 실패하면 throw */
  }
  if (ch.gcalEventId && !existingIds.includes(ch.gcalEventId)) {
    existingIds.unshift(ch.gcalEventId);
  }
  for (const eid of existingIds) {
    await deleteEvent(eid, auth.calendarId).catch(() => {});
  }
  const id = await createEvent(input);
  await prisma.myChannel.update({
    where: { id: channelId },
    data: { gcalEventId: id, gcalSyncedAt: new Date() },
  });
}

export async function unsyncMyChannel(channelId: string): Promise<void> {
  const auth = await prisma.googleOAuth.findUnique({ where: { id: 'default' } });
  const ch = await prisma.myChannel.findUnique({ where: { id: channelId } });
  if (!auth || !ch?.gcalEventId) return;
  try {
    await deleteEvent(ch.gcalEventId, auth.calendarId);
  } catch (e) {
    console.error('[gcal channel unsync]', (e as Error).message);
  }
}

/** 하위 호환: video 단위 호출 → 채널 단위 sync 로 위임 */
export async function syncScheduledVideo(videoId: string): Promise<void> {
  const v = await prisma.scheduledVideo.findUnique({ where: { id: videoId } });
  if (v) await syncMyChannel(v.channelId);
}

export async function unsyncScheduledVideo(videoId: string): Promise<void> {
  const v = await prisma.scheduledVideo.findUnique({ where: { id: videoId } });
  if (v) await syncMyChannel(v.channelId);
}
