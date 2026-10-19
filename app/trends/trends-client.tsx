'use client';

import { useEffect, useState } from 'react';
import { NowSection } from './sections/now';
import { ShoppingSection } from './sections/shopping';
import { KeywordSection } from './sections/keyword';
import { LookupSection } from './sections/lookup';

/**
 * 트렌드 — 드라마·영화·인물·쇼핑처럼 지금 트래픽이 몰리는 관심사를 찾는 탭.
 *
 * 숫자 출처가 섞여 있어서 칸마다 어디 숫자인지 이름을 붙인다.
 *  - 구글 검색량: 구글이 주는 대략치(하한, 10만+ 등)
 *  - 네이버 월간: 검색광고 키워드도구의 최근 30일 실제 검색수 (기간·연령 무관)
 * 어느 칸에서든 키워드 옆 「분석」을 누르면 키워드 분석 칸으로 넘어간다.
 */

type Section = 'now' | 'shopping' | 'keyword' | 'lookup';
const SECTIONS: { key: Section; label: string; hint: string }[] = [
  { key: 'now', label: '구글 트렌드', hint: '4시간 ~ 3달 · 유튜브 검색 포함' },
  { key: 'shopping', label: '연령대별 쇼핑', hint: '네이버 쇼핑인사이트' },
  { key: 'keyword', label: '키워드 분석', hint: '추이 · 연령대 · 화제성' },
  { key: 'lookup', label: '검색수 비교', hint: '네이버 월간 검색수' },
];

const SECTION_KEY = 'saeroi-trends-section';

export function TrendsClient() {
  const [section, setSection] = useState<Section>('now');
  const [analyzeQ, setAnalyzeQ] = useState('');
  const [analyzeCid, setAnalyzeCid] = useState<string | undefined>(undefined);

  // ?s=shopping · ?q=닥터X 처럼 주소로 바로 열 수 있고, 없으면 마지막으로 보던 칸 (편의용 — 실패해도 기본 칸으로)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get('q');
    if (q) {
      setAnalyzeQ(q);
      setSection('keyword');
      return;
    }
    const fromUrl = sp.get('s') as Section | null;
    if (fromUrl && SECTIONS.some((x) => x.key === fromUrl)) {
      setSection(fromUrl);
      return;
    }
    try {
      const s = localStorage.getItem(SECTION_KEY) as Section | null;
      if (s && SECTIONS.some((x) => x.key === s)) setSection(s);
    } catch {
      /* 저장소 막힘 */
    }
  }, []);
  const pick = (s: Section) => {
    setSection(s);
    try {
      localStorage.setItem(SECTION_KEY, s);
    } catch {
      /* 저장소 막힘 */
    }
  };
  const analyze = (q: string, cid?: string) => {
    setAnalyzeQ(q);
    setAnalyzeCid(cid);
    setSection('keyword');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-12 pt-5 xl:px-0 xl:pt-0">
      <div className="mb-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">트렌드</h1>
        <p className="mt-1 text-[13px] font-semibold text-muted-foreground">드라마·영화·인물·쇼핑 — 지금 검색이 몰리는 관심사</p>
      </div>

      <div role="tablist" className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {SECTIONS.map((s) => {
          const active = section === s.key;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={active}
              onClick={() => pick(s.key)}
              className={
                'theme-fade flex shrink-0 flex-col items-start rounded-[14px] px-4 py-2.5 text-left ' +
                (active ? 'card-surface' : 'hover:bg-[color:var(--chip)]')
              }
            >
              <span className={'text-[14px] font-extrabold ' + (active ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span>
              <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">{s.hint}</span>
            </button>
          );
        })}
      </div>

      {section === 'now' && <NowSection onAnalyze={analyze} />}
      {section === 'shopping' && <ShoppingSection onAnalyze={analyze} />}
      {section === 'keyword' && <KeywordSection initial={analyzeQ} initialCid={analyzeCid} onAnalyze={analyze} />}
      {section === 'lookup' && <LookupSection onAnalyze={analyze} />}
    </div>
  );
}
