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

/**
 * 우리가 만든 태스크임을 표시하는 고정 라벨.
 *
 * 채널 라벨은 채널명에서 만들기 때문에 채널 이름이 바뀌면 옛 태스크를 다시 찾을 수 없다.
 * 그래서 이름과 무관한 고정 라벨을 하나 더 붙여 둔다 — 이 라벨이 있는데 현재 어느
 * 채널에도 안 붙는 태스크는 우리가 만들었다가 주인을 잃은 것이므로 지워도 안전하다.
 * (사용자가 직접 만든 태스크에는 이 라벨이 없으므로 건드리지 않는다.)
 */
export const AUTO_LABEL = '새로이자동';

/** 채널 → Todoist 태스크 body (예약 있으면 시각, 없으면 '영상업로드 필요'). */
function channelTaskBody(ch: ChannelRec, projectId: string): Record<string, unknown> {
  const label = ch.name.replace(/\s+/g, '_').slice(0, 60);
  const labels = [label, AUTO_LABEL];
  const count = ch._count.videos;
  const latest = ch.videos[0];
  if (count === 0 || !latest) {
    const content = ch.category ? `${ch.name}(${ch.category}) 영상업로드 필요` : `${ch.name} 영상업로드 필요`;
    return { content, due_date: kstToday(), project_id: projectId, labels, description: '예약된 영상이 없습니다' };
  }
  const content = ch.category ? `${ch.name}_${ch.category}_${kstHHmm(latest.scheduledAt)}` : `${ch.name}_${kstHHmm(latest.scheduledAt)}`;
  return {
    content,
    due_datetime: new Date(latest.scheduledAt).toISOString(),
    project_id: projectId,
    labels,
    description: `예약 영상 ${count}개${latest.title ? `. 마지막: ${latest.title}` : ''}`,
  };
}

/**
 * 「영상업로드 필요」를 한 줄로 모은 태스크에 붙는 라벨.
 *
 * 예약 없는 채널마다 태스크를 따로 만들면 목록이 그것만으로 꽉 찬다.
 * 그래서 그룹당 한 개로 합치고, 이 라벨로 그 한 개를 찾아 제자리 갱신한다
 * (내용에 들어가는 채널이 매일 바뀌므로 제목으로는 다시 찾을 수 없다).
 */
export const AGGREGATE_LABEL = '새로이_업로드필요';

/** Todoist 제목 상한(500)보다 넉넉히 아래에서 자른다. */
const MAX_TITLE = 460;

/** 채널 표기: 분류가 있으면 "이름(분류)". */
function channelCaption(ch: { name: string; category: string | null }): string {
  return ch.category ? `${ch.name}(${ch.category})` : ch.name;
}

/**
 * 예약 없는 채널들 → 한 개의 태스크.
 * 제목: "A(분류), B(분류) 영상업로드 필요"
 * 채널이 많아 제목이 길어지면 뒤를 "외 N개"로 줄이되, 전체 목록은 설명에 남긴다.
 */
function aggregateTaskBody(
  pending: { name: string; category: string | null }[],
  projectId: string
): Record<string, unknown> {
  const captions = pending.map(channelCaption);
  const suffix = ' 영상업로드 필요';

  let list = captions.join(', ');
  if (list.length + suffix.length > MAX_TITLE) {
    const kept: string[] = [];
    let len = 0;
    for (const c of captions) {
      const extra = (kept.length ? 2 : 0) + c.length;
      // 뒤에 붙을 " 외 NN개" 자리도 미리 확보
      if (len + extra + suffix.length + 12 > MAX_TITLE) break;
      kept.push(c);
      len += extra;
    }
    list = `${kept.join(', ')} 외 ${captions.length - kept.length}개`;
  }

  return {
    content: `${list}${suffix}`,
    due_date: kstToday(),
    project_id: projectId,
    labels: [AGGREGATE_LABEL, AUTO_LABEL],
    description: `예약된 영상이 없는 채널 ${captions.length}개\n${captions.map((c) => `- ${c}`).join('\n')}`,
  };
}

/** 모아쓴 태스크를 제자리 갱신. 대상이 없으면 태스크 자체를 지운다. */
async function reconcileAggregateTask(
  token: string,
  projectId: string,
  pending: { name: string; category: string | null }[],
  existing: TodoistTask[]
): Promise<void> {
  if (pending.length === 0) {
    for (const t of existing) await deleteTask(token, t.id).catch(() => {});
    return;
  }
  const body = aggregateTaskBody(pending, projectId);
  if (existing.length > 0) {
    const r = await tdFetch(token, `/tasks/${existing[0].id}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      for (const extra of existing.slice(1)) await deleteTask(token, extra.id);
      return;
    }
    // 사용자가 직접 지웠으면 404 — 새로 만든다.
    if (r.status !== 404) throw new Error(`업로드 필요 태스크 업데이트 실패 (${r.status})`);
    for (const extra of existing.slice(1)) await deleteTask(token, extra.id);
  }
  const c = await tdFetch(token, '/tasks', { method: 'POST', body: JSON.stringify(body) });
  if (!c.ok) throw new Error(`업로드 필요 태스크 생성 실패 (${c.status})`);
}

/** 예약이 하나도 없는 채널인지. */
function isPending(ch: { videos: unknown[]; _count: { videos: number } }): boolean {
  return ch._count.videos === 0 || !ch.videos[0];
}

/**
 * 우리가 만든 태스크인지 판별.
 *
 * AUTO_LABEL 이 1차 근거지만, 이 라벨을 쓰기 전에 만들어진 태스크에는 없다.
 * 그런 예전 것들까지 정리하려고 우리가 쓰는 제목 형식도 같이 본다 —
 * "… 영상업로드 필요" 로 끝나거나 "이름_분류_HH:mm" 꼴.
 * 사용자가 직접 쓴 제목이 이 형식과 겹칠 일은 사실상 없다.
 */
function isAutoTask(t: TodoistTask): boolean {
  if ((t.labels ?? []).includes(AUTO_LABEL)) return true;
  const c = t.content ?? '';
  return / 영상업로드 필요$/.test(c) || /_\d{2}:\d{2}$/.test(c);
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

type SyncChannelRec = ChannelRec & { id: string };
type TodoistConfigRec = Awaited<ReturnType<typeof prisma.todoistConfig.findUnique>> & object;

/**
 * 한 그룹(=Todoist 프로젝트) 전체를 맞춘다.
 *
 * 전체 동기화와 단일 채널 동기화가 이 함수 하나를 공유한다. 예전엔 같은 로직이
 * 두 군데 따로 있어서 한쪽만 고치는 일이 반복됐고, 모아쓰기처럼 그룹 전체를
 * 봐야 하는 규칙은 단일 채널 경로에서 애초에 성립할 수 없다.
 */
async function syncGroupTasks(
  config: TodoistConfigRec,
  group: DashboardGroup,
  channels: SyncChannelRec[]
): Promise<{ tasks: number; orphansDeleted: number; total: number | null }> {
  const token = config.apiToken;
  const projectId = await ensureGroupProject(config, group);
  const names = channels.map((c) => c.name);

  // 1) 활성 태스크 1회 조회 (실패 시 throw → 이 그룹은 아무것도 안 만듦)
  const active = await listTasks(token, projectId);

  // 모아쓴 태스크는 제목이 첫 채널명으로 시작해서 이름 매칭에 걸린다.
  // 채널별 분배에서 미리 빼두지 않으면 그 채널이 자기 것으로 착각해 덮어쓴다.
  const aggregates = active.filter((t) => (t.labels ?? []).includes(AGGREGATE_LABEL));
  const rest = active.filter((t) => !(t.labels ?? []).includes(AGGREGATE_LABEL));
  const byChannel = partitionByChannel(rest, channels);

  const pending = channels.filter(isPending);
  const scheduled = channels.filter((c) => !isPending(c));

  // 2) 예약 있는 채널은 예약 시각이 제각각이라 채널당 한 개 그대로
  let tasks = 0;
  for (const ch of scheduled) {
    await reconcileChannelTask(token, projectId, ch, byChannel.get(ch.id) ?? []);
    tasks += 1;
  }

  // 3) 예약 없는 채널은 한 줄로 합친다. 개별로 남아 있던 예전 태스크는 지운다.
  for (const ch of pending) {
    for (const t of byChannel.get(ch.id) ?? []) await deleteTask(token, t.id).catch(() => {});
  }
  await reconcileAggregateTask(token, projectId, pending, aggregates);
  if (pending.length > 0) tasks += 1;

  // 4) 주인 잃은 태스크 정리.
  //    채널 이름이 바뀌거나 채널이 비활성화되면 그 채널의 옛 태스크는 어느 채널에도
  //    안 붙어서 아무도 안 지웠다 — 「영상업로드 필요」가 계속 남던 이유.
  //    우리가 만든 것(isAutoTask)만 지우므로 직접 만든 태스크는 건드리지 않는다.
  let orphansDeleted = 0;
  const claimed = new Set<string>(aggregates.map((t) => t.id));
  for (const list of byChannel.values()) for (const t of list) claimed.add(t.id);
  for (const t of active) {
    if (claimed.has(t.id) || !isAutoTask(t)) continue;
    await deleteTask(token, t.id).catch(() => {});
    orphansDeleted += 1;
  }

  // 5) 완료(체크)된 이전 태스크 정리 — best effort
  try {
    const completed = await listCompletedTasks(token, projectId);
    for (const t of completed) {
      if (t.content && (taskBelongsTo(t.content, names) || isAutoTask(t))) {
        await deleteTask(token, t.id);
      }
    }
  } catch {
    /* noop */
  }

  const total = await listTasks(token, projectId)
    .then((t) => t.length)
    .catch(() => null);
  return { tasks, orphansDeleted, total };
}

/**
 * 한 채널만 동기화 (영상 추가/수정 시). 목록 조회 실패 시 throw — 절대 무턱대고 생성하지 않음.
 */
export async function syncChannelToTodoist(channelId: string): Promise<number> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) throw new Error('Todoist 미연결');

  // ★publishedUrl 이 있는 행은 '예약' 이 아니라 '발행 기록' 이므로 지우지 않는다.
  //   이 조건이 없던 동안, 스레드 대시보드의 「최근 발행한 글」 에 넣은 링크가 시각이
  //   지나는 순간 이 정리 로직에 수거돼 사라졌다(그 화면이 계속 비어 있던 원인).
  await prisma.scheduledVideo
    .deleteMany({ where: { channelId, scheduledAt: { lt: new Date() }, publishedUrl: null } })
    .catch(() => {});

  const ch = await prisma.myChannel.findUnique({
    where: { id: channelId },
    select: { id: true, isActive: true, todoistGroup: true, platform: true },
  });
  if (!ch || !ch.isActive) return 0;

  // 「영상업로드 필요」는 그룹 전체를 한 태스크로 모으므로, 이 채널만 봐서는
  // 그 태스크를 올바르게 다시 쓸 수 없다. 그래서 속한 그룹 전체를 맞춘다.
  const group = (ch.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(ch.platform);
  const all = await prisma.myChannel.findMany({
    where: { isActive: true },
    include: {
      videos: { where: { publishedUrl: null }, orderBy: { scheduledAt: 'desc' }, take: 1 },
      _count: { select: { videos: { where: { publishedUrl: null } } } },
    },
  });
  const channels = all.filter(
    (c) => ((c.todoistGroup as DashboardGroup) ?? defaultGroupForPlatform(c.platform)) === group
  );
  if (channels.length === 0) return 0;

  const r = await syncGroupTasks(config, group, channels);
  return r.tasks;
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
  /** 채널이 사라져 주인을 잃은 태스크 중 지운 개수 */
  orphansDeleted: number;
  /** 실패한 그룹만. 비어 있으면 전부 성공. */
  groupErrors: Record<string, string>;
}> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) throw new Error('Todoist 미연결');
  const token = config.apiToken;

  // 지난 예약 정리 (전 활성 채널). publishedUrl 있는 발행 기록은 보존 — 위 주석 참조.
  await prisma.scheduledVideo
    .deleteMany({
      where: { scheduledAt: { lt: new Date() }, channel: { isActive: true }, publishedUrl: null },
    })
    .catch(() => {});

  const all = await prisma.myChannel.findMany({
    where: { isActive: true },
    include: {
      videos: { where: { publishedUrl: null }, orderBy: { scheduledAt: 'desc' }, take: 1 },
      _count: { select: { videos: { where: { publishedUrl: null } } } },
    },
  });

  let tasks = 0;
  let totalInProject = 0;
  let orphansDeleted = 0;
  const groups: Record<string, { tasks: number; total: number | null; project: string }> = {};
  const groupErrors: Record<string, string> = {};

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

    // 한 그룹이 실패해도 나머지 그룹은 계속 간다.
    // 예전엔 try/catch 가 없어서 그룹 하나만 삐끗해도 동기화 전체가 죽었고,
    // 그 결과 모든 그룹의 어제 태스크가 그대로 남았다.
    try {
      const r = await syncGroupTasks(config, group, channels);
      groups[group] = { tasks: r.tasks, total: r.total, project: projectName };
      tasks += r.tasks;
      orphansDeleted += r.orphansDeleted;
      if (r.total != null) totalInProject += r.total;
    } catch (e) {
      const msg = (e as Error).message;
      groupErrors[group] = msg;
      groups[group] = { tasks: 0, total: null, project: projectName };
      console.error('[todoist sync] 그룹 실패', group, msg);
    }
  }

  const failed = Object.keys(groupErrors);
  await prisma.todoistConfig.update({
    where: { id: 'default' },
    data: {
      lastSyncedAt: new Date(),
      lastSyncError: failed.length
        ? failed.map((g) => `${g}: ${groupErrors[g]}`).join(' / ').slice(0, 500)
        : null,
    },
  });
  return { tasks, channels: all.length, totalInProject, groups, orphansDeleted, groupErrors };
}

/* ─────────────── 직접 쓰는 할 일 (전체 현황) ─────────────── */

/**
 * 채널 자동 태스크와 같은 프로젝트에 두면 정리 로직(isAutoTask)에 휩쓸릴 수 있어
 * 전용 프로젝트를 따로 쓴다.
 */
export type Todo = {
  id: string;
  content: string;
  /** YYYY-MM-DD. 마감 없으면 null */
  due: string | null;
  /** 시각까지 정한 마감이면 ISO. 날짜만이면 null */
  dueAt: string | null;
  /** p1(높음) ~ p4(기본). Todoist 는 4가 가장 높아서 뒤집어 담는다 */
  priority: number;
  completed: boolean;
  url: string | null;
};

type TodoistTaskFull = {
  id: string;
  content?: string;
  due?: { date?: string; datetime?: string | null } | null;
  priority?: number;
  is_completed?: boolean;
  checked?: boolean;
  url?: string;
};

function toTodo(t: TodoistTaskFull): Todo {
  return {
    id: t.id,
    content: t.content ?? '',
    // due.date 는 시각이 있으면 'YYYY-MM-DDTHH:mm:ss' 로 온다. 화면은 날짜만 쓰므로 잘라 둔다.
    due: t.due?.date ? t.due.date.slice(0, 10) : null,
    dueAt: t.due?.datetime ?? null,
    priority: t.priority ?? 1,
    completed: t.is_completed ?? t.checked ?? false,
    url: t.url ?? null,
  };
}

async function todoConfig(): Promise<{ token: string; projectId: string }> {
  const config = await prisma.todoistConfig.findUnique({ where: { id: 'default' } });
  if (!config) throw new Error('Todoist 미연결');
  const projectId = await ensureProject(
    config.apiToken,
    config.todoProjectName,
    config.todoProjectId
  );
  if (projectId !== config.todoProjectId) {
    await prisma.todoistConfig
      .update({ where: { id: 'default' }, data: { todoProjectId: projectId } })
      .catch(() => {});
  }
  return { token: config.apiToken, projectId };
}

/** 할 일 목록 (미완료만). 조회 실패는 throw — 빈 목록으로 감추면 지운 걸로 오해한다. */
export async function listTodos(): Promise<Todo[]> {
  const { token, projectId } = await todoConfig();
  const all: TodoistTaskFull[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const qs =
      `?project_id=${encodeURIComponent(projectId)}` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const r = await tdFetch(token, `/tasks${qs}`);
    if (!r.ok) throw new Error(`할 일 조회 실패 (${r.status})`);
    const j = (await r.json()) as Paginated<TodoistTaskFull> | TodoistTaskFull[];
    all.push(...(Array.isArray(j) ? j : j.results ?? []));
    cursor = Array.isArray(j) ? null : j.next_cursor ?? null;
    if (!cursor) break;
  }
  return all.map(toTodo);
}

/**
 * 마감을 body 에 싣는다.
 *
 * 시각이 있으면 due_datetime 을 쓴다 — Todoist 의 구글캘린더 연동은 시각이 있는 항목을
 * 확실히 일정으로 만들어 준다. 날짜만이면 종일 항목이라 캘린더 설정에 따라 안 넘어갈 수 있다.
 */
function applyDue(body: Record<string, unknown>, due?: string | null, dueAt?: string | null) {
  if (dueAt) {
    body.due_datetime = dueAt;
  } else if (due) {
    body.due_date = due;
  }
}

export async function createTodo(input: {
  content: string;
  due?: string | null;
  dueAt?: string | null;
  priority?: number;
}): Promise<Todo> {
  const { token, projectId } = await todoConfig();
  const body: Record<string, unknown> = { content: input.content, project_id: projectId };
  applyDue(body, input.due, input.dueAt);
  if (input.priority) body.priority = input.priority;
  const r = await tdFetch(token, '/tasks', { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`할 일 생성 실패 (${r.status})`);
  return toTodo((await r.json()) as TodoistTaskFull);
}

export async function updateTodo(
  id: string,
  patch: { content?: string; due?: string | null; dueAt?: string | null; priority?: number }
): Promise<void> {
  const { token } = await todoConfig();
  const body: Record<string, unknown> = {};
  if (patch.content !== undefined) body.content = patch.content;
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.dueAt) {
    body.due_datetime = patch.dueAt;
  } else if (patch.due !== undefined) {
    // due 를 비우려면 빈 문자열을 보내야 한다 (null 은 무시됨)
    body.due_date = patch.due ?? '';
  }
  const r = await tdFetch(token, `/tasks/${id}`, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`할 일 수정 실패 (${r.status})`);
}

/** 체크 = Todoist 완료 처리 (지우지 않는다 — 완료 기록이 남아야 한다) */
export async function completeTodo(id: string): Promise<void> {
  const { token } = await todoConfig();
  const r = await tdFetch(token, `/tasks/${id}/close`, { method: 'POST' });
  if (!r.ok) throw new Error(`할 일 완료 실패 (${r.status})`);
}

export async function deleteTodo(id: string): Promise<void> {
  const { token } = await todoConfig();
  const r = await tdFetch(token, `/tasks/${id}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`할 일 삭제 실패 (${r.status})`);
}
