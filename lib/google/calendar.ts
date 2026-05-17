/**
 * Google Calendar API 헬퍼 — 이벤트 생성/수정/삭제.
 *
 * 이벤트 제목 정책: `{channelName}` (유저 요청대로 채널명만)
 * 시작=종료=scheduledAt (30분 짜리 이벤트로 생성)
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
  if (!token) throw new Error('Google 연결 안 됨');
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function calendarPath(calendarId: string) {
  return `/calendars/${encodeURIComponent(calendarId)}/events`;
}

type EventInput = {
  calendarId: string;
  title: string;
  startISO: string;
  /** 분 단위 (기본 30분) */
  durationMinutes?: number;
  notes?: string;
  /** YouTube 등 채널 url */
  link?: string;
};

function buildEventBody(e: EventInput) {
  const start = new Date(e.startISO);
  const end = new Date(start.getTime() + (e.durationMinutes ?? 30) * 60_000);
  return {
    summary: e.title,
    description: [e.notes, e.link].filter(Boolean).join('\n\n') || undefined,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Seoul' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Seoul' },
  };
}

export async function createEvent(e: EventInput): Promise<string> {
  const r = await call('POST', calendarPath(e.calendarId), buildEventBody(e));
  if (!r.ok) throw new Error(`이벤트 생성 실패 (${r.status}): ${await r.text()}`);
  const j = (await r.json()) as { id: string };
  return j.id;
}

export async function updateEvent(eventId: string, e: EventInput): Promise<void> {
  const r = await call(
    'PATCH',
    `${calendarPath(e.calendarId)}/${encodeURIComponent(eventId)}`,
    buildEventBody(e)
  );
  if (!r.ok) throw new Error(`이벤트 수정 실패 (${r.status}): ${await r.text()}`);
}

export async function deleteEvent(eventId: string, calendarId: string): Promise<void> {
  const r = await call(
    'DELETE',
    `${calendarPath(calendarId)}/${encodeURIComponent(eventId)}`
  );
  // 404 (이미 삭제됨) 도 성공으로 처리
  if (!r.ok && r.status !== 404 && r.status !== 410)
    throw new Error(`이벤트 삭제 실패 (${r.status}): ${await r.text()}`);
}

/** ScheduledVideo 1건을 GCal 에 upsert. 호출 실패해도 throw 안 함 (best-effort). */
export async function syncScheduledVideo(videoId: string): Promise<void> {
  const v = await prisma.scheduledVideo.findUnique({
    where: { id: videoId },
    include: { channel: true },
  });
  if (!v) return;
  const auth = await prisma.googleOAuth.findUnique({ where: { id: 'default' } });
  if (!auth) return;

  const input: EventInput = {
    calendarId: auth.calendarId,
    title: v.channel.name,
    startISO: v.scheduledAt.toISOString(),
    notes: [v.title, v.notes].filter(Boolean).join('\n'),
    link: v.channel.url ?? undefined,
  };

  try {
    if (v.gcalEventId) {
      await updateEvent(v.gcalEventId, input);
    } else {
      const id = await createEvent(input);
      await prisma.scheduledVideo.update({
        where: { id: v.id },
        data: { gcalEventId: id, gcalSyncedAt: new Date() },
      });
      return;
    }
    await prisma.scheduledVideo.update({
      where: { id: v.id },
      data: { gcalSyncedAt: new Date() },
    });
  } catch (e) {
    console.error('[gcal sync]', (e as Error).message);
  }
}

export async function unsyncScheduledVideo(videoId: string): Promise<void> {
  const v = await prisma.scheduledVideo.findUnique({ where: { id: videoId } });
  if (!v?.gcalEventId) return;
  const auth = await prisma.googleOAuth.findUnique({ where: { id: 'default' } });
  if (!auth) return;
  try {
    await deleteEvent(v.gcalEventId, auth.calendarId);
  } catch (e) {
    console.error('[gcal unsync]', (e as Error).message);
  }
}
