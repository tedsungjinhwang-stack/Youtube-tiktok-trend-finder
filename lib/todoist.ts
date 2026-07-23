import { prisma } from '@/lib/db';

// Todoist 통합 API v1 (REST v2 는 2025 폐기 — 410). https://developer.todoist.com/api/v1/
const BASE = 'https://api.todoist.com/api/v1';

type TodoistProject = { id: string; name: string };
type TodoistUser = { full_name?: string; email?: string };
// v1 리스트는 커서 페이지네이션: { results: [...], next_cursor }
type Paginated<T> = { results?: T[]; next_cursor?: string | null };

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

/** v1 프로젝트 목록 (페이지네이션 병합). */
async function listProjects(token: string): Promise<TodoistProject[]> {
  const all: TodoistProject[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const r = await tdFetch(token, `/projects${qs}`);
    if (!r.ok) break;
    const j = (await r.json()) as Paginated<TodoistProject> | TodoistProject[];
    const page = Array.isArray(j) ? j : j.results ?? [];
    all.push(...page);
    cursor = Array.isArray(j) ? null : j.next_cursor ?? null;
    if (!cursor) break;
  }
  return all;
}

/** 토큰 유효성 검사 — 프로젝트 목록 GET. 성공하면 계정 표시명 반환. */
export async function testTodoistToken(
  token: string
): Promise<{ ok: boolean; account?: string; error?: string }> {
  try {
    const r = await tdFetch(token, '/projects');
    if (r.status === 401 || r.status === 403) return { ok: false, error: '토큰이 유효하지 않음' };
    if (!r.ok) return { ok: false, error: `Todoist ${r.status}` };
    // 계정 이름 (v1 user 엔드포인트) — 실패해도 무시
    let account: string | undefined;
    try {
      const u = await tdFetch(token, '/user');
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
  const projects = await listProjects(token);
  const found = projects.find((p) => p.name === projectName);
  if (found) return found.id;
  // 생성
  const created = await tdFetch(token, '/projects', {
    method: 'POST',
    body: JSON.stringify({ name: projectName }),
  });
  if (!created.ok) throw new Error(`프로젝트 생성 실패 (${created.status})`);
  const p = (await created.json()) as TodoistProject;
  return p.id;
}

/**
 * 한 채널의 예약 영상들을 Todoist 태스크로 upsert.
 * - content: "채널명 - 제목"
 * - due_datetime: 예약시각 (RFC3339)
 * - labels: [채널명]  (Todoist 가 없으면 자동 생성)
 * 반환: 처리한 태스크 수
 */
type TodoistTask = { id: string; labels?: string[]; content?: string };

/** 프로젝트 내 활성 태스크 목록 (페이지네이션 병합). */
async function listTasks(token: string, projectId: string): Promise<TodoistTask[]> {
  const all: TodoistTask[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 30; i++) {
    const qs = `?project_id=${encodeURIComponent(projectId)}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const r = await tdFetch(token, `/tasks${qs}`);
    if (!r.ok) break;
    const j = (await r.json()) as Paginated<TodoistTask> | TodoistTask[];
    const page = Array.isArray(j) ? j : j.results ?? [];
    all.push(...page);
    cursor = Array.isArray(j) ? null : j.next_cursor ?? null;
    if (!cursor) break;
  }
  return all;
}

// v1 완료 태스크 응답: { items | results: [...], next_cursor }
type CompletedResp = { items?: TodoistTask[]; results?: TodoistTask[]; next_cursor?: string | null };

/** 프로젝트 내 완료된 태스크 (최근 90일). 체크한 '영상업로드 필요' 도 정리하기 위함. */
async function listCompletedTasks(token: string, projectId: string): Promise<TodoistTask[]> {
  const until = new Date().toISOString();
  const since = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();
  const all: TodoistTask[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 30; i++) {
    const qs =
      `?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}` +
      `&project_id=${encodeURIComponent(projectId)}&limit=200` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const r = await tdFetch(token, `/tasks/completed/by_completion_date${qs}`);
    if (!r.ok) break;
    const j = (await r.json()) as CompletedResp | TodoistTask[];
    const page = Array.isArray(j) ? j : j.items ?? j.results ?? [];
    all.push(...page);
    cursor = Array.isArray(j) ? null : j.next_cursor ?? null;
    if (!cursor) break;
  }
  return all;
}

/** KST 기준 HH:mm */
function kstHHmm(d: Date): string {
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
}
/** KST 기준 오늘 YYYY-MM-DD */
function kstToday(): string {
  const k = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 캘린더와 동일하게 **채널당 1개 태스크**로 동기화.
 * - 지난 예약(업로드 완료)은 삭제
 * - 예약 0개 → "채널명(카테고리) 영상업로드 필요" (오늘 마감)
 * - 예약 있음 → "채널명_카테고리_HH:mm" (마지막 예약 시각 마감)
 * - 채널 라벨로 기존 태스크를 찾아 지우고 새로 생성 (중복 방지)
 */
type ChannelRec = {
  name: string;
  category: string | null;
  videos: { scheduledAt: Date; title: string }[];
  _count: { videos: number };
};

/** 채널 → Todoist 태스크 body (예약 있으면 시각, 없으면 '영상업로드 필요'). */
function channelTaskBody(ch: ChannelRec, projectId: string): Record<string, unknown> {
  const label = ch.name.replace(/\s+/g, '_').slice(0, 60);
  const count = ch._count.videos;
  const latest = ch.videos[0];
  if (count === 0 || !latest) {
    const content = ch.category ? `${ch.name}(${ch.category}) 영상업로드 필요` : `${ch.name} 영상업로드 필요`;
    return { content, due_date: kstToday(), project_id: projectId, labels: [label], description: '예약된 영상이 없습니다' };
  }
  const content = ch.category ? `${ch.name}_${ch.category}_${kstHHmm(latest.scheduledAt)}` : `${ch.name}_${kstHHmm(latest.scheduledAt)}`;
  return {
    content,
    due_datetime: new Date(latest.scheduledAt).toISOString(),
    project_id: projectId,
    labels: [label],
    description: `예약 영상 ${count}개${latest.title ? `. 마지막: ${latest.title}` : ''}`,
  };
}

/** 태스크 제목이 주어진 채널명들 중 하나에 속하는지 (제목은 항상 "채널명"으로 시작). */
function taskBelongsTo(content: string, names: string[]): boolean {
  return names.some((n) => content === n || content.startsWith(`${n}_`) || content.startsWith(`${n}(`) || content.startsWith(`${n} `));
}

/** id 하나 삭제 (완료 태스크는 reopen 후 삭제). */
async function deleteTask(token: string, id: string): Promise<void> {
  const del = await tdFetch(token, `/tasks/${id}`, { method: 'DELETE' }).catch(() => null);
  if (!del || !del.ok) {
    await tdFetch(token, `/tasks/${id}/reopen`, { method: 'POST' }).catch(() => {});
    await tdFetch(token, `/tasks/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

/**
 * 한 채널만 동기화 (영상 추가/수정 시). 그 채널의 기존 태스크(활성+완료) 삭제 후 1개 생성.
 */
export async function syncChannelToTodoist(channelId: string): Promise<number> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) throw new Error('Todoist 미연결');
  const token = config.apiToken;
  const projectId = await ensureProject(token, config.projectName, config.projectId);
  if (projectId !== config.projectId) {
    await prisma.todoistConfig.update({ where: { id: 'default' }, data: { projectId } });
  }

  await prisma.scheduledVideo
    .deleteMany({ where: { channelId, scheduledAt: { lt: new Date() } } })
    .catch(() => {});

  const ch = await prisma.myChannel.findUnique({
    where: { id: channelId },
    include: { videos: { orderBy: { scheduledAt: 'desc' }, take: 1 }, _count: { select: { videos: true } } },
  });
  if (!ch || !ch.isActive) return 0;

  // 이 채널 기존 태스크(활성+완료) 삭제
  try {
    const [active, completed] = await Promise.all([
      listTasks(token, projectId),
      listCompletedTasks(token, projectId).catch(() => [] as TodoistTask[]),
    ]);
    const label = ch.name.replace(/\s+/g, '_').slice(0, 60);
    const ids = new Set<string>();
    for (const t of [...active, ...completed]) {
      if ((t.labels ?? []).includes(label) || (t.content && taskBelongsTo(t.content, [ch.name]))) ids.add(t.id);
    }
    for (const id of ids) await deleteTask(token, id);
  } catch {
    /* list 실패해도 생성은 시도 */
  }

  const r = await tdFetch(token, '/tasks', { method: 'POST', body: JSON.stringify(channelTaskBody(ch, projectId)) });
  if (!r.ok) throw new Error(`태스크 생성 실패 (${r.status})`);
  return 1;
}

/** 채널 삭제/비활성 시 그 채널 라벨의 Todoist 태스크 제거. */
export async function unsyncChannelFromTodoist(channelId: string): Promise<void> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config?.projectId) return;
  const ch = await prisma.myChannel.findUnique({ where: { id: channelId }, select: { name: true } });
  if (!ch) return;
  const label = ch.name.replace(/\s+/g, '_').slice(0, 60);
  const tasks = await listTasks(config.apiToken, config.projectId).catch(() => []);
  for (const t of tasks.filter((t) => (t.labels ?? []).includes(label))) {
    await tdFetch(config.apiToken, `/tasks/${t.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

/**
 * 활성 채널 전체를 Todoist 로 동기화 (cron·전체동기화용).
 * 핵심: 태스크 목록 조회를 **한 번만** 하고, 우리 채널 것(활성+완료)을 모두 지운 뒤
 * 채널당 1개 생성. 채널마다 조회하던 예전 방식은 rate limit 에 걸려 삭제가 실패,
 * 매일 중복이 쌓였음. 전역 1회 처리로 자기치유(이미 쌓인 중복도 정리)됨.
 */
export async function syncAllToTodoist(): Promise<{ tasks: number; channels: number; totalInProject: number | null }> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) throw new Error('Todoist 미연결');
  const token = config.apiToken;
  const projectId = await ensureProject(token, config.projectName, config.projectId);
  if (projectId !== config.projectId) {
    await prisma.todoistConfig.update({ where: { id: 'default' }, data: { projectId } });
  }

  // 지난 예약 정리 (전 활성 채널)
  await prisma.scheduledVideo
    .deleteMany({ where: { scheduledAt: { lt: new Date() }, channel: { isActive: true } } })
    .catch(() => {});

  const channels = await prisma.myChannel.findMany({
    where: { isActive: true },
    include: { videos: { orderBy: { scheduledAt: 'desc' }, take: 1 }, _count: { select: { videos: true } } },
  });
  const names = channels.map((c) => c.name);

  // 1) 기존 태스크(활성+완료) 한 번만 조회 → 우리 채널 것 전부 삭제 (중복·이전 것 싹)
  const active = await listTasks(token, projectId);
  const completed = await listCompletedTasks(token, projectId).catch(() => [] as TodoistTask[]);
  const ids = new Set<string>();
  for (const t of [...active, ...completed]) if (t.content && taskBelongsTo(t.content, names)) ids.add(t.id);
  for (const id of ids) await deleteTask(token, id);

  // 2) 채널당 1개 생성
  let tasks = 0;
  for (const ch of channels) {
    const r = await tdFetch(token, '/tasks', { method: 'POST', body: JSON.stringify(channelTaskBody(ch, projectId)) });
    if (r.ok) tasks += 1;
  }

  await prisma.todoistConfig.update({ where: { id: 'default' }, data: { lastSyncedAt: new Date(), lastSyncError: null } });
  const totalInProject = (await listTasks(token, projectId).catch(() => [])).length;
  return { tasks, channels: channels.length, totalInProject };
}
