'use client';

import Link from 'next/link';
import { AnalyzeButton, NaverCell, naverSearchUrl, type Naver } from '../ui';

/**
 * 구글 1달·3달 조각 — 「지금 뜨는 것」 칸이 기간을 1달·3달로 바꿨을 때 쓴다.
 * 7일까지(급상승)와 1달 이상(explore)은 구글이 다른 형식으로 줘서 목록 모양이 다르다.
 */

/** 구글 트렌드 '검색 기준' — 유튜브 검색이 채널 소재 찾기엔 가장 직접적이다 */
export const PROPS = [
  { key: '', label: '웹 검색' },
  { key: 'youtube', label: '유튜브 검색' },
  { key: 'froogle', label: '구글 쇼핑' },
  { key: 'news', label: '뉴스' },
];

export type Related = { query: string; value: number; label: string; naver: Naver };

export function ProxyNotice({ what = '구글 1달·3달 조회' }: { what?: string }) {
  return (
    <p className="text-[13.5px] leading-relaxed text-muted-foreground">
      {what}를 시도했는데 구글이 대시보드 서버의 요청을 막았습니다(429). 이럴 땐 인베스트 시그널에서 쓰는 ISP 프록시를 거치면 받을 수 있습니다.
      <br />
      <Link href="/settings/api-keys" className="font-bold text-brand hover:underline">
        설정 → API 키
      </Link>{' '}
      의 「구글 트렌드 프록시」에 <code className="rounded bg-[color:var(--chip)] px-1">BINANCE_PROXY</code> 와 같은 값(
      <code className="rounded bg-[color:var(--chip)] px-1">http://아이디:비번@IP:포트</code>)을 넣어 주세요.
    </p>
  );
}

/** 인기 / 급상승 한 줄 목록 */
export function RelatedList({
  title,
  rows,
  kind,
  naverEnabled,
  onAnalyze,
}: {
  title: string;
  rows: Related[];
  kind: 'top' | 'rising';
  naverEnabled: boolean;
  onAnalyze: (q: string) => void;
}) {
  const maxNaver = Math.max(0, ...rows.map((r) => r.naver?.total ?? 0));
  return (
    <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
      <div className="flex items-center justify-between px-[22px] py-3">
        <h3 className="text-[14px] font-extrabold">{title}</h3>
        <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
          {kind === 'top' ? '1위 = 100' : '이전 기간 대비 증가율'}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-[22px] pb-6 text-[13px] text-[color:var(--text-faint)]">없음</p>
      ) : (
        <ul>
          {rows.map((r, i) => (
            <li
              key={r.query}
              className="group row-hover grid grid-cols-[24px_minmax(0,1fr)_72px_120px] items-center gap-2 px-[22px] py-2"
              style={{ borderTop: '1px solid var(--hairline)' }}
            >
              <span className="num text-[12px] font-bold text-[color:var(--text-faint)]">{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                <a href={naverSearchUrl(r.query)} target="_blank" rel="noopener noreferrer" className="truncate text-[14px] font-bold hover:text-brand hover:underline">
                  {r.query}
                </a>
                <AnalyzeButton q={r.query} onAnalyze={onAnalyze} />
              </span>
              <span className="num text-right text-[12.5px] font-bold">{r.label}</span>
              <NaverCell v={r.naver} max={maxNaver} enabled={naverEnabled} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
