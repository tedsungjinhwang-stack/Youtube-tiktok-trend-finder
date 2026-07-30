import { prisma } from '@/lib/db';
import {
  DASHBOARD_GROUPS,
  defaultGroupForPlatform,
  type DashboardGroup,
} from './todoist-groups';

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
    // 한 요청이 매달려 함수 시간(60s)을 다 먹지 않게 개별 타임아웃
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

type TodoistTask = { id: string; labels?: string[]; content?: string };

/* ─────────────── 대시보드 그룹 ─────────────── */

export {
  DASHBOARD_GROUPS,
  GROUP_LABEL,
  GROUP_PLATFORMS,
  GROUP_PATH,
  defaultGroupForPlatform,
} from './todoist-groups';
export type { DashboardGroup } from './todoist-groups';

type TodoistConfigRow = {
  apiToken: string;
  projectId: string | null;
  projectName: string;
  shoppingProjectId: string | null;
  shoppingProjectName: string;
  threadsProjectId: string | null;
  threadsProjectName: string;
};

/** 그룹 → config 의 프로젝트 id/name 필드 매핑 */
function groupProjectFields(group: DashboardGroup): {
  idField: 'projectId' | 'shoppingProjectId' | 'threadsProjectId';
  nameField: 'projectName' | 'shoppingProjectName' | 'threadsProjectName';
} {
  if (group === 'shopping') return { idField: 'shoppingProjectId', nameField: 'shoppingProjectName' };
  if (group === 'threads') return { idField: 'threadsProjectId', nameField: 'threadsProjectName' };
  return { idField: 'projectId', nameField: 'projectName' };
}

/** 그룹의 Todoist 프로젝트 확보 (없으면 생성) + config 에 id 저장 */
async function ensureGroupProject(
  config: TodoistConfigRow,
  group: DashboardGroup
): Promise<string> {
  const { idField, nameField } = groupProjectFields(group);
  const projectId = await ensureProject(config.apiToken, config[nameField], config[idField]);
  if (projectId !== config[idField]) {
    await prisma.todoistConfig
      .update({ where: { id: 'default' }, data: { [idField]: projectId } })
      .catch(() => {});
  }
  return projectId;
}

/**
 * 프로젝트 내 활성 태스크 목록 (페이지네이션 병합).
 * 조회 실패 시 **throw** — 실패를 빈 목록으로 취급하면 "지울 게 없다"고 판단하고
 * 생성만 진행해 중복이 쌓이는 사고(새벽 cron)가 났었음. 3회 재시도 후 포기.
 */
async function listTasks(token: string, projectId: string): Promise<TodoistTask[]> {
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt);
    try {
      const all: TodoistTask[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 30; i++) {
        const qs = `?project_id=${encodeURIComponent(projectId)}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
        const r = await tdFetch(token, `/tasks${qs}`);
        if (!r.ok) throw new Error(`태스크 목록 조회 실패 (${r.status})`);
        const j = (await r.json()) as Paginated<TodoistTask> | TodoistTask[];
        const page = Array.isArray(j) ? j : j.results ?? [];
        all.push(...page);
        cursor = Array.isArray(j) ? null : j.next_cursor ?? null;
        if (!cursor) break;
      }
      return all;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(lastErr || '태스크 목록 조회 실패');
}

// v1 완료 태스크 응답: { items | results: [...], next_cursor }
type CompletedResp = { items?: TodoistTask[]; results?: TodoistTask[]; next_cursor?: string | null };

/** 프로젝트 내 완료된 태스크 (최근 7일). 체크한 '영상업로드 필요' 도 정리하기 위함. */
async function listCompletedTasks(token: string, projectId: string): Promise<TodoistTask[]> {
  const until = new Date().toISOString();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
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
 * 채널 1개를 기존 태스크에 **제자리 갱신(reconcile)**.
 * - 기존 태스크 있음 → 첫 번째를 업데이트, 나머지는 삭제 (중복 정리)
 * - 없음 → 새로 생성
 * 삭제→재생성 방식은 삭제 단계가 실패하면 중복이 쌓였음. 업데이트 방식은
 * 어떤 부분 실패에서도 중복을 **만들 수 없음**.
 */
async function reconcileChannelTask(
  token: string,
  projectId: string,
  ch: ChannelRec,
  existing: TodoistTask[]
): Promise<void> {
  const body = channelTaskBody(ch, projectId);
  if (existing.length > 0) {
    const r = await tdFetch(token, `/tasks/${existing[0].id}`, { method: 'POST', body: JSON.stringify(body) });
    if (r.ok) {
      for (const extra of existing.slice(1)) await deleteTask(token, extra.id);
      return;
    }
    // 404 = 그 사이 사용자가 태스크를 지움(또는 완료 후 정리됨) → 새로 만들면 됨.
    // 그 외 상태코드는 진짜 오류라 throw.
    if (r.status !== 404) throw new Error(`태스크 업데이트 실패 (${r.status})`);
    for (const extra of existing.slice(1)) await deleteTask(token, extra.id);
  }
  const c = await tdFetch(token, '/tasks', { method: 'POST', body: JSON.stringify(body) });
  if (!c.ok) throw new Error(`태스크 생성 실패 (${c.status})`);
}

/** 활성 태스크를 채널별로 분배 (긴 이름 우선 — 접두사 겹침 오분배 방지). */
function partitionByChannel(
  tasks: TodoistTask[],
  channels: { id: string; name: string }[]
): Map<string, TodoistTask[]> {
  const sorted = [...channels].sort((a, b) => b.name.length - a.name.length);
  const claimed = new Set<string>();
  const map = new Map<string, TodoistTask[]>();
  for (const ch of sorted) {
    const label = ch.name.replace(/\s+/g, '_').slice(0, 60);
    const mine = tasks.filter(
      (t) =>
        !claimed.has(t.id) &&
        ((t.labels ?? []).includes(label) || (t.content ? taskBelongsTo(t.content, [ch.name]) : false))
    );
    mine.forEach((t) => claimed.add(t.id));
    map.set(ch.id, mine);
  }
  return map;
}

/**
 * 한 채널만 동기화 (영상 추가/수정 시). 목록 조회 실패 시 throw — 절대 무턱대고 생성하지 않음.
 */
export async function syncChannelToTodoist(channelId: string): Promise<number> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) throw new Error('Todoist 미연결');
  const token = config.apiToken;

  await prisma.scheduledVideo
    .deleteMany({ where: { channelId, scheduledAt: { lt: new Date() } } })
    .catch(() => {});

  const ch = await prisma.myChannel.findUnique({
    where: { id: channelId },
    include: { videos: { orderBy: { scheduledAt: 'desc' }, take: 1 }, _count: { select: { videos: true } } },
  });
  if (!ch || !ch.isActive) return 0;

  // 채널이 속한 그룹의 프로젝트로만 동기화
  const group = (ch.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(ch.platform);
  const projectId = await ensureGroupProject(config, group);

  // 목록 조회 실패 → throw (조용히 생성하면 중복 생김)
  const active = await listTasks(token, projectId);
  const mine = partitionByChannel(active, [{ id: ch.id, name: ch.name }]).get(ch.id) ?? [];
  await reconcileChannelTask(token, projectId, ch, mine);

  // 완료(체크)된 이전 태스크 정리 — best effort
  try {
    const completed = await listCompletedTasks(token, projectId);
    for (const t of completed) {
      if (t.content && taskBelongsTo(t.content, [ch.name])) await deleteTask(token, t.id);
    }
  } catch {
    /* noop */
  }
  return 1;
}

/** 채널 삭제/비활성 시 그 채널 라벨의 Todoist 태스크 제거. */
export async function unsyncChannelFromTodoist(channelId: string): Promise<void> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) return;
  const ch = await prisma.myChannel.findUnique({ where: { id: channelId }, select: { name: true } });
  if (!ch) return;
  const label = ch.name.replace(/\s+/g, '_').slice(0, 60);
  // 그룹이 바뀐 뒤일 수 있어 모든 그룹 프로젝트에서 제거
  const projectIds = [config.projectId, config.shoppingProjectId, config.threadsProjectId].filter(
    (x): x is string => !!x
  );
  for (const pid of projectIds) {
    const tasks = await listTasks(config.apiToken, pid).catch(() => []);
    for (const t of tasks) {
      if ((t.labels ?? []).includes(label) || (t.content && taskBelongsTo(t.content, [ch.name]))) {
        await tdFetch(config.apiToken, `/tasks/${t.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  }
}

/**
 * 활성 채널 전체를 Todoist 로 동기화 (cron·전체동기화용).
 *
 * 설계 원칙 (중복 누적 사고 2회의 교훈):
 * 1. 목록 조회 실패 → **전체 중단(throw)**. 실패를 빈 목록으로 취급하고 생성으로
 *    넘어가면 "지울 게 없다" 로 판단해 매일 13개씩 중복이 쌓였음.
 * 2. 삭제→재생성 대신 **제자리 업데이트(reconcile)**. 기존 태스크가 있으면 그걸
 *    갱신하므로 어떤 부분 실패에서도 중복이 생길 수 없고, 남는 중복은 지워짐.
 */
export async function syncAllToTodoist(): Promise<{
  tasks: number;
  channels: number;
  totalInProject: number | null;
  groups: Record<string, { tasks: number; total: number | null; project: string }>;
}> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) throw new Error('Todoist 미연결');
  const token = config.apiToken;

  // 지난 예약 정리 (전 활성 채널)
  await prisma.scheduledVideo
    .deleteMany({ where: { scheduledAt: { lt: new Date() }, channel: { isActive: true } } })
    .catch(() => {});

  const all = await prisma.myChannel.findMany({
    where: { isActive: true },
    include: { videos: { orderBy: { scheduledAt: 'desc' }, take: 1 }, _count: { select: { videos: true } } },
  });

  let tasks = 0;
  let totalInProject = 0;
  const groups: Record<string, { tasks: number; total: number | null; project: string }> = {};

  // 그룹(=Todoist 프로젝트)별로 독립 동기화. 한 그룹이 실패해도 나머지는 진행.
  for (const group of DASHBOARD_GROUPS) {
    const channels = all.filter(
      (c) => ((c.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(c.platform)) === group
    );
    const { nameField } = groupProjectFields(group);
    const projectName = config[nameField];
    if (channels.length === 0) {
      groups[group] = { tasks: 0, total: 0, project: projectName };
      continue;
    }

    const projectId = await ensureGroupProject(config, group);
    const names = channels.map((c) => c.name);

    // 1) 활성 태스크 1회 조회 (실패 시 throw → 이 그룹은 아무것도 안 만듦)
    const active = await listTasks(token, projectId);
    const byChannel = partitionByChannel(active, channels);

    // 2) 채널마다 제자리 갱신
    let groupTasks = 0;
    for (const ch of channels) {
      await reconcileChannelTask(token, projectId, ch, byChannel.get(ch.id) ?? []);
      groupTasks += 1;
    }

    // 3) 완료(체크)된 이전 태스크 정리 — best effort
    try {
      const completed = await listCompletedTasks(token, projectId);
      for (const t of completed) {
        if (t.content && taskBelongsTo(t.content, names)) await deleteTask(token, t.id);
      }
    } catch {
      /* noop */
    }

    const total = await listTasks(token, projectId).then((t) => t.length).catch(() => null);
    groups[group] = { tasks: groupTasks, total, project: projectName };
    tasks += groupTasks;
    if (total != null) totalInProject += total;
  }

  await prisma.todoistConfig.update({
    where: { id: 'default' },
    data: { lastSyncedAt: new Date(), lastSyncError: null },
  });
  return { tasks, channels: all.length, totalInProject, groups };
}
