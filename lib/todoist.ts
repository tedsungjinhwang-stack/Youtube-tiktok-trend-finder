import { prisma } from '@/lib/db';

const BASE = 'https://api.todoist.com/rest/v2';

type TodoistProject = { id: string; name: string };
type TodoistUser = { full_name?: string; email?: string };

async function tdFetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

/** 토큰 유효성 검사 — 프로젝트 목록 GET. 성공하면 계정 표시명 반환. */
export async function testTodoistToken(
  token: string
): Promise<{ ok: boolean; account?: string; error?: string }> {
  try {
    const r = await tdFetch(token, '/projects');
    if (r.status === 401 || r.status === 403) return { ok: false, error: '토큰이 유효하지 않음' };
    if (!r.ok) return { ok: false, error: `Todoist ${r.status}` };
    // 계정 이름은 Sync API 로만 확실히 옴 — 실패해도 무시
    let account: string | undefined;
    try {
      const u = await fetch('https://api.todoist.com/sync/v9/user', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (u.ok) {
        const j = (await u.json()) as TodoistUser;
        account = j.full_name || j.email;
      }
    } catch {
      /* noop */
    }
    return { ok: true, account };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** 설정된 프로젝트 확보 — 없으면 생성해서 config 에 저장. */
async function ensureProject(token: string, projectName: string, existingId: string | null): Promise<string> {
  if (existingId) {
    // 존재 확인
    const r = await tdFetch(token, `/projects/${existingId}`);
    if (r.ok) return existingId;
  }
  // 같은 이름 프로젝트 찾기
  const list = await tdFetch(token, '/projects');
  if (list.ok) {
    const projects = (await list.json()) as TodoistProject[];
    const found = projects.find((p) => p.name === projectName);
    if (found) return found.id;
  }
  // 생성
  const created = await tdFetch(token, '/projects', {
    method: 'POST',
    body: JSON.stringify({ name: projectName }),
  });
  if (!created.ok) throw new Error(`프로젝트 생성 실패 (${created.status})`);
  const p = (await created.json()) as TodoistProject;
  return p.id;
}

function taskContent(channelName: string, title: string): string {
  const t = title?.trim();
  return t ? `${channelName} - ${t}` : `${channelName} 영상 업로드`;
}

/**
 * 한 채널의 예약 영상들을 Todoist 태스크로 upsert.
 * - content: "채널명 - 제목"
 * - due_datetime: 예약시각 (RFC3339)
 * - labels: [채널명]  (Todoist 가 없으면 자동 생성)
 * 반환: 처리한 태스크 수
 */
export async function syncChannelToTodoist(channelId: string): Promise<number> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) throw new Error('Todoist 미연결');
  const token = config.apiToken;
  const projectId = await ensureProject(token, config.projectName, config.projectId);
  if (projectId !== config.projectId) {
    await prisma.todoistConfig.update({ where: { id: 'default' }, data: { projectId } });
  }

  const channel = await prisma.myChannel.findUnique({
    where: { id: channelId },
    select: { name: true, videos: { select: { id: true, title: true, scheduledAt: true, todoistTaskId: true } } },
  });
  if (!channel) return 0;

  const label = channel.name.replace(/\s+/g, '_').slice(0, 60);
  let count = 0;

  for (const v of channel.videos) {
    const body = {
      content: taskContent(channel.name, v.title),
      due_datetime: new Date(v.scheduledAt).toISOString(),
      project_id: projectId,
      labels: [label],
    };
    if (v.todoistTaskId) {
      // 업데이트 (due 는 별도 필드도 되지만 v2 는 content/due_datetime update 지원)
      const r = await tdFetch(token, `/tasks/${v.todoistTaskId}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (r.status === 404) {
        // 삭제된 태스크 — 새로 만듦
        await createTask(token, body, v.id);
      } else if (!r.ok) {
        throw new Error(`태스크 업데이트 실패 (${r.status})`);
      }
    } else {
      await createTask(token, body, v.id);
    }
    count++;
  }
  return count;
}

async function createTask(
  token: string,
  body: Record<string, unknown>,
  videoId: string
): Promise<void> {
  const r = await tdFetch(token, '/tasks', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`태스크 생성 실패 (${r.status})`);
  const task = (await r.json()) as { id: string };
  await prisma.scheduledVideo.update({
    where: { id: videoId },
    data: { todoistTaskId: task.id },
  });
}

/** 활성 채널 전체를 Todoist 로 동기화. 반환: {tasks, channels}. */
export async function syncAllToTodoist(): Promise<{ tasks: number; channels: number }> {
  const channels = await prisma.myChannel.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  let tasks = 0;
  for (const c of channels) {
    tasks += await syncChannelToTodoist(c.id);
  }
  await prisma.todoistConfig.update({
    where: { id: 'default' },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });
  return { tasks, channels: channels.length };
}
