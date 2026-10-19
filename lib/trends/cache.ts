/**
 * 트렌드 탭 공용 — 캐시와 키 읽기.
 *
 * 외부 소스(구글·네이버)는 자주 부르면 막힌다. 화면을 열 때마다 새로 받지 않고
 * 소스+조건을 key 로 TrendCache 에 잠깐 저장해 두고 재사용한다.
 */
import { prisma } from '@/lib/db';

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ data: T; fetchedAt: string; cached: boolean }> {
  const row = await prisma.trendCache.findUnique({ where: { key } }).catch(() => null);
  if (row && Date.now() - row.fetchedAt.getTime() < ttlMs) {
    return { data: row.payload as T, fetchedAt: row.fetchedAt.toISOString(), cached: true };
  }
  const data = await load();
  const now = new Date();
  await prisma.trendCache
    .upsert({
      where: { key },
      create: { key, payload: data as object, fetchedAt: now },
      update: { payload: data as object, fetchedAt: now },
    })
    .catch(() => {
      /* 캐시 저장 실패는 화면에 영향 없음 */
    });
  return { data, fetchedAt: now.toISOString(), cached: false };
}

/**
 * 키는 Credential 테이블에서 매번 직접 읽는다.
 * lib/credentials 의 메모리 캐시는 서버리스 인스턴스마다 따로라, 설정 화면에서 방금 넣은 값이
 * 다른 인스턴스에선 안 보일 수 있다. 없으면 같은 이름의 환경변수로 폴백.
 */
export async function readSecret(service: string): Promise<string | null> {
  const row = await prisma.credential.findUnique({ where: { service } }).catch(() => null);
  const v = row?.value?.trim() || process.env[service]?.trim();
  return v || null;
}

/** 예외 메시지에서 URL 자격증명(user:pass@)을 지운다 — 프록시 주소가 통째로 로그·화면에 찍히지 않게 */
export function scrubSecrets(msg: string): string {
  return msg.replace(/(?<=\/\/)[^/\s@]+:[^/\s@]+@/g, '***:***@');
}

/** 동시에 n개까지만 돌리는 map (외부 소스에 한꺼번에 몰리지 않게) */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** 어제(KST) 기준 날짜 범위. 네이버 데이터랩은 당일 데이터가 없다 */
export function kstRangeEndingYesterday(days: number): { start: string; end: string } {
  const KST = 9 * 3600_000;
  const todayKst = new Date(Date.now() + KST);
  const end = new Date(Date.UTC(todayKst.getUTCFullYear(), todayKst.getUTCMonth(), todayKst.getUTCDate() - 1));
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const f = (d: Date) => d.toISOString().slice(0, 10);
  return { start: f(start), end: f(end) };
}
