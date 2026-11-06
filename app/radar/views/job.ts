/**
 * 백그라운드 AI 작업 기다리기 — POST 로 시작하고, 4초마다 GET 으로 끝났는지 묻는다.
 * 묻는 중 연결이 잠깐 끊겨도(휴대폰 화면 꺼짐 등) 그냥 다시 묻는다. 분석은 서버에서 계속 돈다.
 */

export type JobState = { status: 'running' | 'done' | 'error'; startedAt: string; finishedAt?: string; ms?: number; error?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function waitForJob<T>(url: string, pick: (d: any) => T | null, alive: () => boolean = () => true): Promise<T> {
  const until = Date.now() + 7 * 60_000;
  while (Date.now() < until) {
    await sleep(4000);
    if (!alive()) throw new Error('cancelled');
    let d: any;
    try {
      d = await (await fetch(url, { cache: 'no-store' })).json();
    } catch {
      continue;
    }
    const job = d?.job as JobState | null;
    if (job?.status === 'running') continue;
    if (job?.status === 'error') throw new Error(job.error ?? '분석에 실패했습니다');
    const r = pick(d);
    if (r) return r;
  }
  throw new Error('너무 오래 걸립니다 — 잠시 뒤 새로고침해 보세요 (분석은 서버에서 계속됩니다)');
}

/** 시작하고 끝날 때까지 기다린다 */
export async function runJob<T>(url: string, pick: (d: any) => T | null, alive?: () => boolean): Promise<T> {
  let d: any = null;
  let status = 0;
  try {
    const r = await fetch(url, { method: 'POST' });
    status = r.status;
    d = await r.json().catch(() => null);
  } catch {
    // 시작 요청이 끊겨도 서버에서는 시작됐을 수 있다 — 기다려 본다
    return waitForJob(url, pick, alive);
  }
  if (!d?.ok) throw new Error(d?.error ?? `시작하지 못했습니다 (HTTP ${status})`);
  return waitForJob(url, pick, alive);
}

/** 진행 중인 작업이 시작한 뒤 몇 초 */
export const sinceStart = (job: JobState | null | undefined) => (job ? Math.max(0, Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000)) : 0);
