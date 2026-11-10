/**
 * 무거운 집계 미리 계산 — 화면·AI 분석이 기다리지 않게 2시간마다 차례로 한 번씩.
 *
 * 플레이북(양산형·형식·부활·템플릿) · 기회판(한국어/전체) · 종합 분석 자료 · 황금키워드는 각각 작은 DB 에서 수십 초~2분이라,
 * 화면을 열거나 「다시 분석」을 누를 때 계산하면 서로 겹쳐 2분 한도(statement timeout)에 걸렸다 (11/10 종합 분석 실패).
 * 읽는 쪽은 저장해 둔 걸 4시간까지 쓰고, 여기서 force 로 새로 계산한다. 수집기가 쉬는 시간(홀수 시 10분)에 pg_cron 이 부른다.
 */

import { prisma } from '@/lib/db';
import { getPlaybook } from './playbook';
import { categoryOutlook } from './outlook';
import { getBriefInput } from './brief';
import { refreshGolden } from './tabs';

export type PrecomputeReport = { ms: number; done: { name: string; ms: number }[]; skipped: string[]; errors: string[] };

export async function runPrecompute(o: { deadline: number }): Promise<PrecomputeReport> {
  const t0 = Date.now();
  const out: PrecomputeReport = { ms: 0, done: [], skipped: [], errors: [] };
  // 순서: 종합 분석 자료가 기회판·플레이북을 쓰니 그 둘을 먼저 (그러면 자료 모으기는 저장본을 읽는다)
  const steps: [string, () => Promise<unknown>][] = [
    ['playbook', () => getPlaybook({ force: true })],
    ['outlook:kr', () => categoryOutlook({ force: true })],
    ['outlook:all', () => categoryOutlook({ foreign: true, force: true })],
    ['brief-input', () => getBriefInput({ force: true })],
    ['golden', () => refreshGolden()],
  ];
  for (const [name, fn] of steps) {
    // 한 단계가 길면 1~2분 — 끝낼 시간이 100초 넘게 남았을 때만 시작 (못 한 건 다음 번에, 읽는 쪽은 그동안 이전 저장본)
    if (Date.now() > o.deadline - 100_000) {
      out.skipped.push(name);
      continue;
    }
    const s = Date.now();
    try {
      await fn();
      out.done.push({ name, ms: Date.now() - s });
    } catch (e) {
      out.errors.push(`${name}: ${(e as Error).message.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }
  out.ms = Date.now() - t0;
  await prisma.trendCache
    .upsert({ where: { key: 'radar:last-precompute' }, create: { key: 'radar:last-precompute', payload: out as object }, update: { payload: out as object, fetchedAt: new Date() } })
    .catch(() => {});
  return out;
}
