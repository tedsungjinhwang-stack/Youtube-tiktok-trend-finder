/**
 * 오래 걸리는 Claude 분석을 백그라운드 작업으로 — 버튼 요청은 바로 돌려주고, 분석은 Vercel waitUntil 로 이어서 돈다.
 * 화면은 몇 초마다 상태를 다시 묻는다. 그래서 휴대폰 화면이 꺼지거나 연결이 끊겨도(「Failed to fetch」) 분석은 끝까지 가고 결과가 남는다.
 * 상태는 TrendCache `job:<이름>` 에 둔다.
 */

import { waitUntil } from '@vercel/functions';
import { prisma } from '@/lib/db';

export type JobState = {
  status: 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  ms?: number;
  error?: string;
};

/** 함수 최대 시간(300초)보다 길게 '진행 중'이면 함수가 끊긴 것 */
const STALE_MS = 330_000;
const key = (name: string) => `job:${name}`;

async function save(name: string, s: JobState) {
  await prisma.trendCache
    .upsert({ where: { key: key(name) }, create: { key: key(name), payload: s as object }, update: { payload: s as object, fetchedAt: new Date() } })
    .catch(() => {});
}

export async function jobState(name: string): Promise<JobState | null> {
  const row = await prisma.trendCache.findUnique({ where: { key: key(name) } }).catch(() => null);
  const s = (row?.payload as unknown as JobState) ?? null;
  if (s?.status === 'running' && Date.now() - new Date(s.startedAt).getTime() > STALE_MS) {
    return { ...s, status: 'error', error: '5분 안에 끝나지 않아 멈췄습니다 — 다시 시도해 주세요' };
  }
  return s;
}

/** 이미 돌고 있으면 그 상태를, 아니면 새로 시작한 상태를 돌려준다 */
export async function startJob(name: string, fn: () => Promise<unknown>): Promise<{ started: boolean; job: JobState }> {
  const cur = await jobState(name);
  if (cur?.status === 'running') return { started: false, job: cur };
  const t0 = Date.now();
  const job: JobState = { status: 'running', startedAt: new Date(t0).toISOString() };
  await save(name, job);
  const run = fn()
    .then(() => save(name, { status: 'done', startedAt: job.startedAt, finishedAt: new Date().toISOString(), ms: Date.now() - t0 }))
    .catch((e) =>
      save(name, { status: 'error', startedAt: job.startedAt, finishedAt: new Date().toISOString(), ms: Date.now() - t0, error: (e as Error).message.slice(0, 300) })
    );
  waitUntil(run);
  return { started: true, job };
}
