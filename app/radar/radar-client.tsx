'use client';

import { useMemo, useState } from 'react';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  isHoneyPot,
  type CrowdedWork,
  type RadarData,
  type RelatedWork,
  type RisingWork,
  type ShortClip,
  type WorkCategory,
  type WorkRef,
} from '@/lib/radar/types';
import { Pill, ago, short } from '../trends/ui';

/**
 * 꿀통레이더 — 경쟁 채널 쇼츠를 감시해서
 *  ① 지금 막 뜨는 작품, ② 그 출연진의 다른 작품 중 조회는 나오는데 경쟁이 적은 것(꿀통),
 *  ③ 아직 아무도 안 만든 것(빈자리), ④ 여러 채널이 몰려서 피해야 할 작품을 보여 준다.
 *
 * 색 규칙(트렌드 탭과 같음): 막대·강조는 한 색, 상태 배지는 글자로도 뜻을 쓴다(색에만 기대지 않음).
 */

const TMDB_IMG = process.env.NEXT_PUBLIC_TMDB_IMG_BASE || 'https://image.tmdb.org/t/p';
const img = (path: string | null | undefined, size: 'w185' | 'w300') => (path ? `${TMDB_IMG}/${size}${path}` : null);

const PERIODS = [
  { key: '24h', label: '24시간' },
  { key: '3d', label: '3일' },
  { key: '7d', label: '7일' },
];

function dateShort(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ───────────────────────── 작은 조각 ───────────────────────── */

function Poster({ path, title, w = 48 }: { path: string | null; title: string; w?: number }) {
  const src = img(path, 'w185');
  return (
    <span
      className="block shrink-0 overflow-hidden rounded-lg"
      style={{ width: w, aspectRatio: '2 / 3', background: 'var(--chip)' }}
      title={title}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB 외부 이미지, 크기 작음
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="grid h-full w-full place-items-center text-[12px] font-bold text-[color:var(--text-faint)]">{title.slice(0, 2)}</span>
      )}
    </span>
  );
}

/** 9:16 쇼츠 썸네일 + 조회수 */
function ShortThumb({ c, rank, size = 'md' }: { c: ShortClip; rank?: number; size?: 'sm' | 'md' }) {
  const src = c.thumb ? (c.thumb.startsWith('/') ? img(c.thumb, 'w300') : c.thumb) : null;
  return (
    <a
      href={c.videoId.length === 11 ? `https://www.youtube.com/shorts/${c.videoId}` : undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={`${c.title} · ${c.channel}`}
      className={'relative block shrink-0 overflow-hidden rounded-xl ' + (size === 'sm' ? 'w-[64px]' : 'w-full')}
      style={{ aspectRatio: '9 / 16', background: 'var(--chip)' }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- 썸네일
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
      <span className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0) 55%)' }} />
      {rank && (
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-black text-white">#{rank}</span>
      )}
      <span className={'num absolute bottom-1 left-1.5 font-extrabold text-white ' + (size === 'sm' ? 'text-[11px]' : 'text-[18px]')}>
        {short(c.views)}
      </span>
    </a>
  );
}

function Chip({ children, tone = 'plain', title }: { children: React.ReactNode; tone?: 'plain' | 'amber' | 'green' | 'red' | 'brand'; title?: string }) {
  const style =
    tone === 'amber'
      ? { background: 'var(--amber-bg)', color: 'var(--amber)' }
      : tone === 'green'
        ? { background: 'var(--green-bg)', color: 'var(--green)' }
        : tone === 'red'
          ? { background: 'var(--red-bg)', color: 'var(--red)' }
          : tone === 'brand'
            ? { background: 'var(--accent-solid)', color: 'var(--on-accent, #fff)' }
            : { background: 'var(--chip)', color: 'var(--text-quaternary)' };
  return (
    <span title={title} className="inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[11.5px] font-bold" style={style}>
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] font-semibold text-[color:var(--text-faint)]">{label}</span>
      <span className="num text-[16px] font-extrabold leading-tight">{value}</span>
    </span>
  );
}

function WorkTags({ w }: { w: WorkRef }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Chip>
        {CATEGORY_LABEL[w.category]} · {w.year}
      </Chip>
      {w.onAir && <Chip tone="red">방영 중</Chip>}
      {w.tags.slice(0, 2).map((t) => (
        <Chip key={t}>{t}</Chip>
      ))}
    </span>
  );
}

/* ───────────────────────── 연관작 카드 ───────────────────────── */

function RelatedCard({ r }: { r: RelatedWork }) {
  const honey = isHoneyPot(r);
  const crowded = r.channels >= 6;
  return (
    <div className="rounded-2xl p-3" style={{ background: 'var(--subtle)' }}>
      <div className="flex gap-3">
        <Poster path={r.poster} title={r.title} w={52} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-extrabold">{r.title}</span>
            {honey && (
              <Chip tone="green" title="조회 30만 이상 · 다루는 채널 2곳 이하">
                꿀통
              </Chip>
            )}
            {crowded && (
              <Chip tone="amber" title="이미 여러 채널이 다루는 중">
                경쟁 많음
              </Chip>
            )}
          </div>
          <div className="mt-1">
            <WorkTags w={r} />
          </div>
          <div className="mt-1 text-[11.5px] font-semibold text-[color:var(--text-faint)]">{r.via.join(' · ')} 출연</div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Metric label="최고 조회" value={short(r.maxViews)} />
        <Metric label="100만+" value={`${r.millionCount}편`} />
        <Metric label="다루는 채널" value={`${r.channels}곳`} />
      </div>
      {r.topShorts.length > 0 && (
        <div className="mt-2.5 flex gap-1.5">
          {r.topShorts.slice(0, 3).map((c, i) => (
            <ShortThumb key={c.videoId} c={c} rank={i + 1} size="sm" />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── 뜨는 작품 카드 ───────────────────────── */

function RisingCard({ w, periodLabel }: { w: RisingWork; periodLabel: string }) {
  const [open, setOpen] = useState(false);
  const byCat = useMemo(() => {
    const m = new Map<WorkCategory, { title: string; year: string }[]>();
    for (const u of w.unmeasured) m.set(u.category, [...(m.get(u.category) ?? []), u]);
    return [...m.entries()];
  }, [w.unmeasured]);

  return (
    <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
      {/* 머리 */}
      <div className="flex flex-wrap items-start gap-3 px-[22px] pt-5">
        <Poster path={w.poster} title={w.title} w={44} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[19px] font-extrabold tracking-[-0.03em]">{w.title}</h3>
            {w.spike && (
              <Chip tone="amber" title="쇼츠 1편·채널 1곳에서만 터졌습니다. 반짝일 수 있어요">
                ⚠ 송곳주의
              </Chip>
            )}
            {w.channels >= 6 && (
              <Chip tone="amber" title="이 작품 자체는 이미 여러 채널이 다루는 중 — 연관작을 노리세요">
                경쟁 많음 {w.channels}곳
              </Chip>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <WorkTags w={w} />
            <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">{w.cast.slice(0, 4).join(' · ')}</span>
          </div>
        </div>
        {/* 좁은 화면에선 숫자를 제목 아래 한 줄로 */}
        <div className="flex basis-full gap-5 sm:basis-auto">
          <Metric label={`최근 ${periodLabel} 포착`} value={`${w.recentShorts}편`} />
          <Metric label="최고 조회" value={short(w.maxViews)} />
          <Metric label="다루는 채널" value={`${w.channels}곳`} />
        </div>
      </div>

      {/* 본문: 뜬 쇼츠 | 이어서 볼 연관작 */}
      <div className="grid gap-4 px-[22px] pb-4 pt-4 md:grid-cols-[150px_minmax(0,1fr)]">
        {/* 좁은 화면에선 썸네일 옆에 제목 (전체 폭으로 키우면 화면을 다 먹는다) */}
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 md:block">
          <ShortThumb c={w.topShort} rank={1} />
          <div>
            <p className="line-clamp-3 text-[12.5px] font-bold leading-snug md:mt-2 md:line-clamp-2">{w.topShort.title}</p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-[color:var(--text-faint)]">
              {w.topShort.channel} · {dateShort(w.topShort.publishedAt)} 게시
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-[13.5px] font-extrabold">이어서 볼 연관작</h4>
            <span className="num rounded-full px-2 py-px text-[11.5px] font-bold text-[color:var(--text-faint)]" style={{ background: 'var(--chip)' }}>
              {w.related.length}
            </span>
            <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">같은 출연진 · 감시 채널에 쇼츠가 있는 작품 · 꿀통 먼저</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
            {[...w.related]
              .sort((a, b) => Number(isHoneyPot(b)) - Number(isHoneyPot(a)) || b.maxViews - a.maxViews)
              .map((r) => (
                <RelatedCard key={r.key} r={r} />
              ))}
          </div>
        </div>
      </div>

      {/* 빈자리 */}
      {w.unmeasured.length > 0 && (
        <div className="px-[22px] pb-5" style={{ borderTop: '1px solid var(--hairline)' }}>
          <button onClick={() => setOpen(!open)} className="mt-3 flex items-center gap-2 text-[13px] font-extrabold hover:text-brand">
            <span>{open ? '▾' : '▸'}</span>
            아직 아무도 안 만든 연관작 <span className="num">{w.unmeasured.length}</span>개
            <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">— 감시 채널에 쇼츠가 하나도 없는 출연작</span>
          </button>
          {open ? (
            <div className="mt-2.5 space-y-2">
              {byCat.map(([cat, list]) => (
                <div key={cat} className="flex flex-wrap items-baseline gap-1.5">
                  <span className="w-[76px] shrink-0 text-[12px] font-bold text-muted-foreground">
                    {CATEGORY_LABEL[cat]} {list.length}
                  </span>
                  {list.map((u) => (
                    <span key={u.title + u.year} className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold" style={{ background: 'var(--chip)' }}>
                      {u.title} <span className="num text-[color:var(--text-faint)]">{u.year}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 line-clamp-1 text-[12px] font-semibold text-[color:var(--text-faint)]">
              {w.unmeasured.slice(0, 12).map((u) => u.title).join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── 피해야 할 픽 ───────────────────────── */

function CrowdedList({ rows }: { rows: CrowdedWork[] }) {
  return (
    <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
      <div className="flex items-center justify-between px-[22px] py-3.5">
        <h3 className="text-[15px] font-extrabold">지금 피해야 할 픽</h3>
        <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">여러 채널이 한꺼번에 몰려 조회가 떨어지는 작품</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.key} className="row-hover grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-[22px] py-2.5" style={{ borderTop: '1px solid var(--hairline)' }}>
            <Poster path={r.poster} title={r.title} w={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-bold">{r.title}</span>
                <Chip tone="red">과밀</Chip>
              </div>
              <div className="mt-0.5">
                <WorkTags w={r} />
              </div>
            </div>
            <div className="flex gap-5 text-right">
              <Metric label="몰린 채널" value={`${r.channels}곳`} />
              <span className="hidden sm:block">
                <Metric label="쇼츠" value={`${r.recentShorts}편`} />
              </span>
              <Metric label="평균 조회" value={`${short(r.avgViews)} (${r.trend > 0 ? '+' : '−'}${Math.abs(r.trend)}%)`} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── 작품 못 찾은 쇼츠 ───────────────────────── */

function UnmatchedList({ rows }: { rows: ShortClip[] }) {
  return (
    <section className="card-surface theme-fade overflow-hidden rounded-[22px]">
      <div className="px-[22px] py-3.5">
        <h3 className="text-[15px] font-extrabold">작품을 못 찾은 급상승 쇼츠</h3>
        <p className="mt-0.5 text-[12px] font-semibold text-[color:var(--text-faint)]">제목만으로는 작품을 몰라서 — 직접 지정하면 다음부터 자동으로 붙습니다</p>
      </div>
      <ul>
        {rows.map((c) => (
          <li key={c.videoId} className="row-hover grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-[22px] py-2.5" style={{ borderTop: '1px solid var(--hairline)' }}>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold">{c.title}</div>
              <div className="text-[12px] font-semibold text-[color:var(--text-faint)]">
                {c.channel} · {dateShort(c.publishedAt)} · <span className="num">{short(c.views)}</span> 조회
              </div>
            </div>
            <button className="h-8 rounded-[10px] border border-input px-3 text-[12.5px] font-bold text-muted-foreground hover:text-foreground">작품 지정</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── 사이드 메뉴 ───────────────────────── */

type ViewKey = string;
type NavItem = {
  key: ViewKey;
  label: string;
  /** 분류 메뉴 — 누르면 '막 뜨는 작품' 화면을 이 분류로 거른다 */
  category?: WorkCategory[];
  /** 아직 안 만든 화면: 무엇을 보여줄지 · 데이터 출처 */
  plan?: { what: string; source: string };
};

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: '',
    items: [
      { key: 'home', label: '홈', plan: { what: '오늘 뭐 만들까 — 뜨는 작품·꿀통 연관작·피해야 할 픽을 한 화면에 요약', source: '아래 화면들의 요약' } },
      { key: 'schedule', label: '편성표', plan: { what: '오늘·이번 주 방영·공개되는 드라마·예능·영화 (첫 방송 직후를 선점)', source: 'TMDB 방영 일정 · 넷플릭스 등 OTT 공개일' } },
      { key: 'surge', label: '떡상 감지', plan: { what: '감시 채널 쇼츠 중 조회가 갑자기 튄 영상을 시간 단위로', source: '감시 채널 쇼츠 · 시간별 조회수 변화' } },
    ],
  },
  {
    group: '오늘',
    items: [
      { key: 'rising', label: '막 뜨는 작품·연관 꿀통' },
      { key: 'tone', label: '결 지도', plan: { what: '결(장르·톤)별로 작품을 묶은 지도 — 한 작품을 했으면 같은 결로 트래픽 이어가기', source: 'TMDB 장르·키워드 + 결 분류(직접 수정 가능)' } },
      { key: 'season', label: '시즌·오픈', plan: { what: '새 시즌·신작이 막 공개된 작품 — 첫 주 선점용', source: 'TMDB 신규 시즌·공개일' } },
      { key: 'feed', label: '소재 피드', plan: { what: '감시 채널이 올린 새 쇼츠 전체 흐름 (최신순, 작품별 묶음)', source: '감시 채널 쇼츠' } },
      { key: 'entry', label: '진입 성적표', plan: { what: '최근 새로 다뤄지기 시작한 작품의 첫 쇼츠 성적 — 지금 들어가도 되는지', source: '감시 채널 쇼츠 · 작품별 첫 등장' } },
      { key: 'daily', label: '데일리 떡상쇼츠', plan: { what: '하루 단위 조회 상위 쇼츠 랭킹', source: '감시 채널 쇼츠 · 하루 조회 증가량' } },
      { key: 'golden', label: '황금키워드', plan: { what: '검색은 많은데 쇼츠는 적은 작품·배우 키워드', source: '네이버 월간 검색수(트렌드 탭) × 감시 채널 쇼츠 수' } },
    ],
  },
  {
    group: '제작',
    items: [{ key: 'make', label: '원클릭 제작', plan: { what: 'AI 자동 편집 — 대시보드 밖 작업 도구라 나중에 따로 검토', source: '—' } }],
  },
  {
    group: '드라마·영화',
    items: [
      // 한드짜 = 한국 드라마·영화 짜깁기 (한국 영화 전용 메뉴가 따로 없어서 같이 둔다)
      { key: 'c-kdrama', label: '한드짜', category: ['kr_drama', 'kr_movie'] },
      // 예드짜 = 예능 짜깁기
      { key: 'c-variety', label: '예드짜', category: ['kr_variety', 'intl_variety'] },
      { key: 'awards', label: '시상식', plan: { what: '시상식·축하무대 클립이 뜨는 시기와 작품', source: '감시 채널 쇼츠 · 시상식 일정' } },
      { key: 'c-intl', label: '해외', category: ['intl_movie', 'intl_drama', 'intl_variety'] },
      { key: 'longform', label: '영화롱폼', plan: { what: '롱폼(10분+) 영화 리뷰 채널에서 뜨는 작품 — 쇼츠로 옮기기', source: '감시 채널 롱폼 영상' } },
    ],
  },
  {
    group: '인물·예능',
    items: [
      { key: 'person', label: '인물선점', plan: { what: '쇼츠·검색이 막 늘기 시작한 배우·인물 — 출연작 묶음으로 선점', source: 'TMDB 출연 기록 · 감시 채널 쇼츠 · 검색수' } },
      { key: 'fan', label: '팬튜브', plan: { what: '배우·아이돌 팬 채널에서 뜨는 인물과 출연작', source: '팬 채널 감시 그룹' } },
      { key: 'speed', label: '속도전', plan: { what: '방영 직후 몇 시간 안에 올려야 하는 회차형 예능·드라마', source: '편성표 × 감시 채널 첫 업로드 시각' } },
      { key: 'comedy', label: '코미디', plan: { what: '코미디·스케치 채널에서 뜨는 소재', source: '코미디 감시 그룹' } },
      { key: 'sketch', label: '스케치', plan: { what: '스케치 코미디 쇼츠 흐름', source: '스케치 감시 그룹' } },
    ],
  },
  {
    // 작품(TMDB) 대신 여행지·상품을 단위로 같은 흐름: 떡상 릴스 → 뜨는 것 → 꿀통(검색↑·릴스↓) → 과밀
    group: '인스타 릴스',
    items: [
      {
        key: 'ig-travel',
        label: '여행릴스',
        plan: {
          what: '뜨는 숙소가 중심 — 여행 릴스의 캡션·@숙소 계정·해시태그로 숙소를 묶어 릴스 수·최고 조회·다루는 계정 수·숙소명 검색수를 보고, 꿀통 숙소(조회↑·계정↓)와 몰린 숙소를 나눈다. 같은 지역·같은 종류(풀빌라·오션뷰·온천·애견동반 등)의 이어서 볼 숙소, 숙소를 지역으로 모은 뜨는 여행지도 함께',
          source: '인스타 여행 계정 감시 그룹 (Meta 공식 API) · 네이버 검색수(숙소명·여행지) · 구글 트렌드 여행 분야',
        },
      },
      {
        key: 'ig-shopping',
        label: '쇼핑릴스',
        plan: {
          what: '쇼핑·공구 릴스 계정에서 뜨는 상품 — 상품별 릴스 수·최고 조회·다루는 계정 수, 검색·쇼핑 클릭은 많은데 릴스는 적은 꿀통 상품, 연관 상품(검색광고 연관 키워드)',
          source: '인스타 쇼핑 계정 감시 그룹 (Meta 공식 API) · 네이버 쇼핑인사이트·검색수(트렌드 탭)',
        },
      },
    ],
  },
];
const NAV_ITEMS = NAV.flatMap((g) => g.items);

function RadarNav({ view, onPick }: { view: ViewKey; onPick: (it: NavItem) => void }) {
  return (
    <nav className="card-surface theme-fade sticky top-[76px] rounded-[20px] p-2.5">
      {NAV.map((g) => (
        <div key={g.group || 'top'} className={g.group ? 'mt-2.5' : ''}>
          {g.group && <div className="px-2.5 pb-1 text-[11.5px] font-extrabold text-[color:var(--text-faint)]">{g.group}</div>}
          {g.items.map((it) => {
            const active = view === it.key;
            return (
              <button
                key={it.key}
                onClick={() => onPick(it)}
                className={
                  'theme-fade flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-[7px] text-left text-[13px] font-bold ' +
                  (active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')
                }
                style={active ? { background: 'var(--chip)' } : undefined}
              >
                <span className="truncate">{it.label}</span>
                {it.plan && <span className="shrink-0 text-[10.5px] font-semibold text-[color:var(--text-faint)]">준비</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function PlannedView({ it }: { it: NavItem }) {
  return (
    <section className="card-surface theme-fade rounded-[22px] px-[22px] py-6">
      <div className="flex items-center gap-2">
        <h2 className="text-[20px] font-extrabold tracking-[-0.03em]">{it.label}</h2>
        <Chip>준비 중</Chip>
      </div>
      <p className="mt-3 text-[14px] font-semibold leading-relaxed">{it.plan?.what}</p>
      <p className="mt-1.5 text-[12.5px] font-semibold text-[color:var(--text-faint)]">데이터: {it.plan?.source}</p>
    </section>
  );
}

/* ───────────────────────── 페이지 ───────────────────────── */

function SummaryTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card-surface theme-fade rounded-[20px] px-[20px] py-4">
      <div className="num text-[26px] font-extrabold leading-none tracking-[-0.04em]">{value}</div>
      <div className="mt-2 text-[13px] font-semibold text-muted-foreground">{label}</div>
      {detail && <div className="mt-0.5 text-[11.5px] font-semibold text-[color:var(--text-faint)]">{detail}</div>}
    </div>
  );
}

export function RadarClient({ data }: { data: RadarData }) {
  const [cat, setCat] = useState<WorkCategory | 'all'>('all');
  const [view, setView] = useState<ViewKey>('rising');
  const [navCats, setNavCats] = useState<WorkCategory[] | null>(null);
  const [period, setPeriod] = useState('3d');
  const [group, setGroup] = useState('all');
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? '3일';
  // 사이드의 분류 메뉴(한드짜 등)가 고른 분류 → 위 칩 필터보다 먼저
  const inCats = (c: WorkCategory) => (navCats ? navCats.includes(c) : cat === 'all' || c === cat);
  const rising = data.rising.filter((w) => inCats(w.category));
  const crowded = data.crowded.filter((w) => inCats(w.category));
  const current = NAV_ITEMS.find((it) => it.key === view);
  const pick = (it: NavItem) => {
    setView(it.key);
    if (it.category) {
      setNavCats(it.category);
      setCat(it.category.length === 1 ? it.category[0] : 'all');
    } else if (it.key === 'rising') {
      setNavCats(null);
      setCat('all');
    }
  };
  const showRising = view === 'rising' || !!current?.category;

  return (
    <div className="mx-auto grid max-w-[1440px] gap-3 px-5 pb-12 pt-5 lg:grid-cols-[180px_minmax(0,1fr)] xl:px-0 xl:pt-0">
      <aside className="hidden lg:block">
        <RadarNav view={view} onPick={pick} />
      </aside>
      <div className="min-w-0">
      {/* 좁은 화면 — 사이드 메뉴 대신 가로로 넘기는 메뉴 */}
      <div className="mb-3 flex gap-1 overflow-x-auto pb-1 lg:hidden">
        {NAV_ITEMS.map((it) => (
          <Pill key={it.key} active={view === it.key} onClick={() => pick(it)}>
            {it.label}
          </Pill>
        ))}
      </div>
      {data.sample && (
        <div className="surface-warn mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold">
          시안 화면입니다 — 작품·포스터·출연진은 TMDB 실제 정보, 조회수·채널 수·쇼츠 제목은 예시입니다. 감시 채널을 등록하면 실제 데이터로 바뀝니다.
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">꿀통레이더</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            경쟁 채널 쇼츠를 감시해서 — 뜨는 작품, 그 출연진의 경쟁 적은 작품, 아직 아무도 안 만든 작품
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-right text-[12px] font-semibold text-[color:var(--text-faint)]">
            감시 채널 <span className="num">{data.monitoredChannels}</span>곳
            <br />
            마지막 수집 {ago(data.collectedAt)}
          </span>
          <button className="h-10 rounded-xl bg-brand px-4 text-[13.5px] font-bold text-brand-foreground hover:opacity-90">지금 수집</button>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <SummaryTile label={`최근 ${periodLabel} 급상승 쇼츠`} value={String(data.summary.surgingShorts)} detail={`작품 인식 ${data.summary.matchRate}%`} />
        <SummaryTile label="뜨는 작품" value={String(data.summary.risingWorks)} />
        <SummaryTile label="꿀통 연관작" value={String(data.summary.honeyPots)} detail="조회 30만+ · 채널 2곳 이하" />
        <SummaryTile label="피해야 할 픽" value={String(data.summary.crowded)} detail="여러 채널 몰림" />
      </div>

      <div className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Pill strong active={cat === 'all' && !navCats} onClick={() => { setCat('all'); setNavCats(null); setView('rising'); }}>
              전체
            </Pill>
            {CATEGORIES.map((c) => (
              <Pill strong key={c} active={!navCats ? cat === c : navCats.length === 1 && navCats[0] === c} onClick={() => { setCat(c); setNavCats(null); setView('rising'); }}>
                {CATEGORY_LABEL[c]}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {PERIODS.map((p) => (
              <Pill key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
                {p.label}
              </Pill>
            ))}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[12.5px] font-bold text-[color:var(--text-faint)]">감시 그룹</span>
          <Pill active={group === 'all'} onClick={() => setGroup('all')}>
            전체
          </Pill>
          {data.groups.map((g) => (
            <Pill key={g} active={group === g} onClick={() => setGroup(g)}>
              {g}
            </Pill>
          ))}
        </div>
      </div>

      {!showRising && current?.plan ? (
        <PlannedView it={current} />
      ) : (
      <>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-[18px] font-extrabold tracking-[-0.03em]">{current?.category ? `${current.label} · ` : ''}막 뜨는 작품 · 연관 꿀통</h2>
        <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">최근 {periodLabel} 감시 채널에서 조회가 튄 작품 순</span>
      </div>
      <div className="mb-6 space-y-3">
        {rising.length === 0 ? (
          <p className="card-surface rounded-[22px] py-12 text-center text-[14px] font-semibold text-muted-foreground">이 분류에는 뜨는 작품이 없습니다</p>
        ) : (
          rising.map((w) => <RisingCard key={w.key} w={w} periodLabel={periodLabel} />)
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <CrowdedList rows={crowded} />
        <UnmatchedList rows={data.unmatched} />
      </div>
      </>
      )}
      </div>
    </div>
  );
}
