/**
 * 네이버 검색광고 API — 키워드도구(/keywordstool)의 월간 검색수.
 *
 * 숫자는 최근 30일 합계(PC·모바일 따로)이고, 기간·연령으로 쪼개 주지 않는다.
 * 한 번에 힌트 키워드 5개까지라 5개씩 묶어 부르고, 결과는 KeywordVolume 에 며칠 보관한다.
 * 드라마·인물 같은 비상품 키워드도 검색수는 나온다 (연관 키워드는 거의 안 줌).
 */
import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { mapLimit, readSecret } from './cache';

const BASE = 'https://api.searchad.naver.com';
const TTL_MS = 3 * 86_400_000;

export type Volume = { pc: number; mobile: number; total: number; comp: string | null };

/** 네이버가 키워드를 맞춰 보는 방식 — 공백 무시, 영문 대소문자 무시 */
export function volumeKey(kw: string): string {
  return kw.replace(/\s+/g, '').toLowerCase();
}

type Creds = { customer: string; license: string; secret: string };

export async function searchadCreds(): Promise<Creds | null> {
  const [customer, license, secret] = await Promise.all([
    readSecret('NAVER_SEARCHAD_CUSTOMER_ID'),
    readSecret('NAVER_SEARCHAD_ACCESS_LICENSE'),
    readSecret('NAVER_SEARCHAD_SECRET_KEY'),
  ]);
  return customer && license && secret ? { customer, license, secret } : null;
}

type RawRow = {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx?: string;
};

/** "< 10" 같은 문자열은 5 로 본다 (0 으로 두면 '검색 없음'과 구분이 안 된다) */
function num(v: number | string): number {
  return typeof v === 'number' ? v : 5;
}

async function callTool(c: Creds, hints: string[]): Promise<RawRow[]> {
  const uri = '/keywordstool';
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', c.secret).update(`${ts}.GET.${uri}`).digest('base64');
  const qs = new URLSearchParams({ hintKeywords: hints.join(','), showDetail: '1' });
  const res = await fetch(`${BASE}${uri}?${qs}`, {
    headers: { 'X-Timestamp': ts, 'X-API-KEY': c.license, 'X-Customer': c.customer, 'X-Signature': sig },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`searchad HTTP ${res.status}`);
  const j = (await res.json()) as { keywordList?: RawRow[] };
  return j.keywordList ?? [];
}

/**
 * 키워드 → 월간 검색수. 캐시에 있으면 그걸 쓰고, 없는 것만 네이버에 묻는다.
 * 키가 없으면 빈 맵 (화면은 '키 필요'로 표시).
 */
export async function getVolumes(keywords: string[]): Promise<{ map: Record<string, Volume | null>; enabled: boolean }> {
  const keys = [...new Set(keywords.map(volumeKey).filter(Boolean))];
  const map: Record<string, Volume | null> = {};
  if (keys.length === 0) return { map, enabled: true };

  const rows = await prisma.keywordVolume.findMany({ where: { keyword: { in: keys } } }).catch(() => []);
  const fresh = new Set<string>();
  for (const r of rows) {
    if (Date.now() - r.fetchedAt.getTime() > TTL_MS) continue;
    fresh.add(r.keyword);
    map[r.keyword] =
      r.pc === null || r.mobile === null ? null : { pc: r.pc, mobile: r.mobile, total: r.pc + r.mobile, comp: r.comp };
  }
  const missing = keys.filter((k) => !fresh.has(k));
  if (missing.length === 0) return { map, enabled: true };

  const creds = await searchadCreds();
  if (!creds) return { map, enabled: false };

  // 네이버 힌트 키워드는 공백이 있으면 거절한다 → 공백 뺀 형태로 보낸다
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += 5) batches.push(missing.slice(i, i + 5));

  const found = new Map<string, Volume>();
  // 네이버가 실제로 답한 키워드만 — 실패한 호출을 '데이터 없음'으로 저장하면 며칠 동안 안 고쳐진다
  const answered = new Set<string>();
  await mapLimit(batches, 2, async (batch) => {
    let list: RawRow[] = [];
    try {
      list = await callTool(creds, batch);
      batch.forEach((k) => answered.add(k));
    } catch {
      // 한 키워드 때문에 묶음 전체가 거절될 수 있다 → 하나씩 다시
      for (const k of batch) {
        try {
          list.push(...(await callTool(creds, [k])));
          answered.add(k);
        } catch {
          /* 이 키워드는 이번엔 건너뛴다 (저장하지 않음 → 다음에 다시 묻는다) */
        }
      }
    }
    const want = new Set(batch);
    for (const r of list) {
      const k = volumeKey(r.relKeyword);
      if (!want.has(k)) continue; // 연관 키워드는 버린다
      const pc = num(r.monthlyPcQcCnt);
      const mobile = num(r.monthlyMobileQcCnt);
      found.set(k, { pc, mobile, total: pc + mobile, comp: r.compIdx ?? null });
    }
  });

  const now = new Date();
  await Promise.all(
    missing.map((k) => {
      const v = found.get(k) ?? null;
      map[k] = v;
      if (!answered.has(k)) return null;
      return prisma.keywordVolume
        .upsert({
          where: { keyword: k },
          create: { keyword: k, pc: v?.pc ?? null, mobile: v?.mobile ?? null, comp: v?.comp ?? null, fetchedAt: now },
          update: { pc: v?.pc ?? null, mobile: v?.mobile ?? null, comp: v?.comp ?? null, fetchedAt: now },
        })
        .catch(() => null);
    })
  );
  return { map, enabled: true };
}
