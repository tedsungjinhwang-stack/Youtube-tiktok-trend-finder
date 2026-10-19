/**
 * 네이버 검색광고 API — 키워드도구(/keywordstool).
 *
 * 키워드마다 최근 30일 합계로 검색수·평균 클릭수·클릭률(PC·모바일 따로), 경쟁 정도,
 * 광고 노출 수를 준다. 기간·연령으로 쪼개 주지는 않는다.
 * 한 번에 힌트 키워드 5개까지라 5개씩 묶어 부르고, 결과는 KeywordVolume 에 며칠 보관한다.
 * 상품 키워드는 연관 키워드(최대 1,000개)도 같이 오는데, 드라마·인물은 거의 안 준다.
 */
import crypto from 'node:crypto';
import { prisma } from '@/lib/db';
import { cached, mapLimit, readSecret } from './cache';

const BASE = 'https://api.searchad.naver.com';
const TTL_MS = 3 * 86_400_000;

export type Volume = {
  pc: number;
  mobile: number;
  total: number;
  comp: string | null;
  /** 월평균 클릭수 */
  pcClk: number | null;
  mobileClk: number | null;
  /** 월평균 클릭률 % */
  pcCtr: number | null;
  mobileCtr: number | null;
  /** 월평균 노출 광고 수 */
  adDepth: number | null;
};

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
  monthlyAvePcClkCnt?: number | string;
  monthlyAveMobileClkCnt?: number | string;
  monthlyAvePcCtr?: number | string;
  monthlyAveMobileCtr?: number | string;
  plAvgDepth?: number | string;
  compIdx?: string;
};

/** "< 10" 같은 문자열은 5 로 본다 (0 으로 두면 '검색 없음'과 구분이 안 된다) */
function num(v: number | string): number {
  return typeof v === 'number' ? v : 5;
}
function opt(v: number | string | undefined): number | null {
  if (v === undefined || v === null) return null;
  return typeof v === 'number' ? v : Number.isFinite(Number(v)) ? Number(v) : null;
}

function toVolume(r: RawRow): Volume {
  const pc = num(r.monthlyPcQcCnt);
  const mobile = num(r.monthlyMobileQcCnt);
  return {
    pc,
    mobile,
    total: pc + mobile,
    comp: r.compIdx ?? null,
    pcClk: opt(r.monthlyAvePcClkCnt),
    mobileClk: opt(r.monthlyAveMobileClkCnt),
    pcCtr: opt(r.monthlyAvePcCtr),
    mobileCtr: opt(r.monthlyAveMobileCtr),
    adDepth: opt(r.plAvgDepth),
  };
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

function saveRow(k: string, v: Volume | null, now: Date) {
  const data = {
    pc: v?.pc ?? null,
    mobile: v?.mobile ?? null,
    comp: v?.comp ?? null,
    pcClk: v?.pcClk ?? null,
    mobileClk: v?.mobileClk ?? null,
    pcCtr: v?.pcCtr ?? null,
    mobileCtr: v?.mobileCtr ?? null,
    adDepth: v?.adDepth ?? null,
    fetchedAt: now,
  };
  return prisma.keywordVolume
    .upsert({ where: { keyword: k }, create: { keyword: k, ...data }, update: data })
    .catch(() => null);
}

/**
 * 키워드 → 검색수·클릭 지표. 캐시에 있으면 그걸 쓰고, 없는 것만 네이버에 묻는다.
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
    // 클릭 지표를 넣기 전에 저장된 줄(검색수만 있음)은 다시 받는다
    if (r.pc !== null && r.pcClk === null) continue;
    fresh.add(r.keyword);
    map[r.keyword] =
      r.pc === null || r.mobile === null
        ? null
        : {
            pc: r.pc,
            mobile: r.mobile,
            total: r.pc + r.mobile,
            comp: r.comp,
            pcClk: r.pcClk,
            mobileClk: r.mobileClk,
            pcCtr: r.pcCtr,
            mobileCtr: r.mobileCtr,
            adDepth: r.adDepth,
          };
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
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await mapLimit(batches, 2, async (batch) => {
    let list: RawRow[] = [];
    try {
      list = await callTool(creds, batch);
      batch.forEach((k) => answered.add(k));
    } catch {
      // 한꺼번에 많이 부르면 일부가 거절된다 (실측: 60개 중 몇 묶음) → 쉬었다가 같은 묶음 한 번 더
      await sleep(1200);
      try {
        list = await callTool(creds, batch);
        batch.forEach((k) => answered.add(k));
      } catch {
        // 그래도 안 되면 한 키워드 때문일 수 있다 → 하나씩
        for (const k of batch) {
          await sleep(300);
          try {
            list.push(...(await callTool(creds, [k])));
            answered.add(k);
          } catch {
            /* 이 키워드는 이번엔 건너뛴다 (저장하지 않음 → 다음에 다시 묻는다) */
          }
        }
      }
    }
    const want = new Set(batch);
    for (const r of list) {
      const k = volumeKey(r.relKeyword);
      if (want.has(k)) found.set(k, toVolume(r)); // 연관 키워드는 여기선 버린다
    }
  });

  const now = new Date();
  await Promise.all(
    missing.map((k) => {
      const v = found.get(k) ?? null;
      map[k] = v;
      return answered.has(k) ? saveRow(k, v, now) : null;
    })
  );
  return { map, enabled: true };
}

export type RelatedKeyword = { keyword: string } & Volume;

/**
 * 연관 키워드 — 검색수 많은 순 상위 limit 개. 상품 키워드에서만 의미 있게 나온다.
 * 같이 온 지표는 KeywordVolume 에도 넣어 둔다 (나중에 그 키워드를 조회하면 바로 나오게).
 */
export async function getRelated(keyword: string, limit = 40): Promise<{ items: RelatedKeyword[]; enabled: boolean }> {
  const creds = await searchadCreds();
  if (!creds) return { items: [], enabled: false };
  const self = volumeKey(keyword);
  const { data } = await cached(`searchad-related:${self}`, TTL_MS, async () => {
    const list = await callTool(creds, [self]);
    const now = new Date();
    const rows = list.map((r) => ({ keyword: r.relKeyword, ...toVolume(r) }));
    // 저장은 상위 몇백 개만 (1,000개 전부는 과하다)
    await Promise.all(
      [...rows]
        .sort((a, b) => b.total - a.total)
        .slice(0, 200)
        .map((r) => saveRow(volumeKey(r.keyword), r, now))
    );
    return rows;
  });
  const items = data
    .filter((r) => volumeKey(r.keyword) !== self)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
  return { items, enabled: true };
}
