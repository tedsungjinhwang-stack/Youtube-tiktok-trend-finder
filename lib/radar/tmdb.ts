/**
 * TMDB — 작품(영화·드라마·예능)과 출연자. 키는 Credential 의 TMDB_READ_TOKEN (없으면 TMDB_API_KEY).
 * 한국어 제목을 받으려고 language=ko-KR.
 */

import { readSecret } from '@/lib/trends/cache';
import type { WorkCategory } from './types';

const BASE = 'https://api.themoviedb.org/3';

async function auth(): Promise<{ headers: Record<string, string>; query: Record<string, string> } | null> {
  const token = await readSecret('TMDB_READ_TOKEN');
  if (token) return { headers: { Authorization: `Bearer ${token}` }, query: {} };
  const key = await readSecret('TMDB_API_KEY');
  if (key) return { headers: {}, query: { api_key: key } };
  return null;
}

let authCache: { at: number; v: Awaited<ReturnType<typeof auth>> } | null = null;

export async function tmdb<T = any>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!authCache || Date.now() - authCache.at > 300_000) authCache = { at: Date.now(), v: await auth() };
  const a = authCache.v;
  if (!a) throw new Error('TMDB 키가 없습니다 (설정 → API 키)');
  const qs = new URLSearchParams({ language: 'ko-KR', ...a.query, ...params });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}${path}?${qs}`, { headers: { Accept: 'application/json', ...a.headers }, cache: 'no-store' });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`TMDB ${res.status} ${path}`);
  }
  throw new Error(`TMDB 429 ${path}`);
}

/** TMDB TV 장르: 예능으로 보는 것 (리얼리티·토크·뉴스·키즈 제외 안 함) */
const VARIETY_GENRES = new Set([10764, 10767]);

export function categoryOf(mediaType: 'tv' | 'movie', p: { genre_ids?: number[]; genres?: { id: number }[]; origin_country?: string[]; original_language?: string }): WorkCategory {
  const genres = p.genre_ids ?? p.genres?.map((g) => g.id) ?? [];
  const kr = (p.origin_country ?? []).includes('KR') || p.original_language === 'ko';
  if (mediaType === 'movie') return kr ? 'kr_movie' : 'intl_movie';
  const variety = genres.some((g) => VARIETY_GENRES.has(g));
  return kr ? (variety ? 'kr_variety' : 'kr_drama') : variety ? 'intl_variety' : 'intl_drama';
}

/** TMDB 장르 이름 (ko) — 결 지도용 */
export const GENRE_LABEL: Record<number, string> = {
  28: '액션',
  12: '모험',
  16: '애니메이션',
  35: '코미디',
  80: '범죄',
  99: '다큐',
  18: '드라마',
  10751: '가족',
  14: '판타지',
  36: '역사',
  27: '공포',
  10402: '음악',
  9648: '미스터리',
  10749: '로맨스',
  878: 'SF',
  10770: 'TV 영화',
  53: '스릴러',
  10752: '전쟁',
  37: '서부',
  10759: '액션·모험',
  10762: '키즈',
  10763: '뉴스',
  10764: '리얼리티',
  10765: 'SF·판타지',
  10766: '연속극',
  10767: '토크',
  10768: '전쟁·정치',
};
