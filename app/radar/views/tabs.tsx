'use client';

import { useEffect, useState } from 'react';
import { CATEGORY_LABEL, type WorkCategory } from '@/lib/radar/types';
import type { EntryRow, GoldenRow, MiniVideo, MiniWork, PersonRow, ScheduleDay, SeasonItem, SpeedRow, ToneGroup } from '@/lib/radar/tabs';
import type { HotVideo } from '@/lib/radar/queries';
import type { RadarData } from '@/lib/radar/types';
import {
  awardsAction,
  entriesAction,
  goldenAction,
  homeAction,
  personsAction,
  scheduleAction,
  seasonAction,
  speedAction,
  tonesAction,
} from '../actions';
import { Chip, Empty, VideoThumb, ago, short } from './parts';

/**
 * 꿀통레이더 나머지 탭 — 진입 성적표 · 인물선점 · 결 지도 · 편성표 · 시즌·오픈 · 황금키워드 · 속도전 · 시상식 · 홈.
 * 데이터는 lib/radar/tabs (수집한 쇼츠 + 작품 인식 + TMDB 방영 정보 + 네이버 검색수).
 */

const TMDB_IMG = process.env.NEXT_PUBLIC_TMDB_IMG_BASE || 'https://image.tmdb.org/t/p';

/* ───────────── 공용 ───────────── */

function useLoad<T>(load: () => Promise<T>): { data: T | null; err: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    load()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 화면을 열 때 한 번
  }, []);
  return { data, err };
}

function Header({ title, sub, aside }: { title: string; sub: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">{title}</h1>
        <p className="mt-1 text-[13px] font-semibold text-muted-foreground">{sub}</p>
      </div>
      {aside}
    </div>
  );
}

function Loading<T>({ data, err, empty, children }: { data: T | null; err: string | null; empty?: (d: T) => boolean; children: (d: T) => React.ReactNode }) {
  if (err) return <Empty>불러오지 못했습니다 — {err}</Empty>;
  if (!data) return <Empty>불러오는 중…</Empty>;
  if (empty?.(data)) return <Empty>아직 보여줄 게 없습니다. 수집기가 매시간 쇼츠를 모으고 작품을 찾으면 채워집니다.</Empty>;
  return <>{children(data)}</>;
}

function Poster({ path, title, w = 44 }: { path: string | null; title: string; w?: number }) {
  return (
    <span className="block shrink-0 overflow-hidden rounded-lg" style={{ width: w, aspectRatio: '2 / 3', background: 'var(--chip)' }} title={title}>
      {path ? (
        // eslint-disable-next-line @next/next/no-img-element -- TMDB 포스터
        <img src={`${TMDB_IMG}/w185${path}`} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="grid h-full w-full place-items-center text-[11px] font-bold text-[color:var(--text-faint)]">{title.slice(0, 2)}</span>
      )}
    </span>
  );
}

function WorkLine({ w }: { w: MiniWork }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[14px] font-extrabold">{w.title}</div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        <Chip>
          {CATEGORY_LABEL[w.category]}
          {w.year ? ` · ${w.year}` : ''}
        </Chip>
        {w.onAir && <Chip tone="red">방영 중</Chip>}
        {w.networks.slice(0, 2).map((n) => (
          <Chip key={n}>{n}</Chip>
        ))}
      </div>
    </div>
  );
}

function VideoRow({ v, extra }: { v: MiniVideo; extra?: React.ReactNode }) {
  const vertical = v.isShorts !== false;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <VideoThumb id={v.id} src={null} vertical={false} size="sm" className="w-[68px]" />
      <div className="min-w-0">
        <a
          href={vertical ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-1 text-[12.5px] font-bold hover:underline"
          title={v.title}
        >
          {v.title}
        </a>
        <div className="num text-[11.5px] font-semibold text-[color:var(--text-faint)]">
          {short(v.views)}회 · {v.channel} · {ago(v.publishedAt)}
          {extra}
        </div>
      </div>
    </div>
  );
}

const card = 'card-surface theme-fade rounded-[20px] p-4';

/* ───────────── 진입 성적표 ───────────── */

const VERDICT: Record<EntryRow['verdict'], { label: string; tone: 'green' | 'amber' | 'red' }> = {
  go: { label: '들어가도 됨', tone: 'green' },
  ok: { label: '보통', tone: 'amber' },
  weak: { label: '약함', tone: 'red' },
};

export function EntryView() {
  const { data, err } = useLoad(entriesAction);
  return (
    <>
      <Header title="진입 성적표" sub="최근 14일 안에 감시 채널에서 새로 다뤄지기 시작한 작품 — 첫 쇼츠 성적으로 지금 들어가도 되는지" />
      <Loading data={data} err={err} empty={(d) => d.length === 0}>
        {(rows) => (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {rows.map((r) => (
              <div key={r.work.id} className={card + ' flex gap-3'}>
                <Poster path={r.work.posterPath} title={r.work.title} w={52} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <WorkLine w={r.work} />
                    <Chip tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].label}</Chip>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] font-semibold text-muted-foreground">
                    <span>첫 쇼츠 {ago(r.firstAt)}</span>
                    <span className="num">
                      쇼츠 {r.shorts} · 채널 {r.channels}
                    </span>
                    <span className="num">중앙 {short(r.medianViews)} · 최고 {short(r.maxViews)}</span>
                    {r.multiple != null && <span className="num">채널 평소의 {r.multiple.toFixed(1)}배</span>}
                  </div>
                  <div className="space-y-1.5">
                    {r.top.slice(0, 2).map((v) => (
                      <VideoRow key={v.id} v={v} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Loading>
    </>
  );
}

/* ───────────── 인물선점 ───────────── */

export function PersonView() {
  const { data, err } = useLoad(personsAction);
  return (
    <>
      <Header title="인물선점" sub="출연작 쇼츠 조회가 막 늘기 시작한 배우 — 최근 7일 vs 그 전 7일, 아직 아무도 안 만든 출연작까지" />
      <Loading data={data} err={err} empty={(d) => d.length === 0}>
        {(rows) => (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((p: PersonRow) => (
              <div key={p.id} className={card + ' space-y-2.5'}>
                <div className="flex items-center gap-2.5">
                  {p.profilePath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- TMDB 인물 사진
                    <img src={`${TMDB_IMG}/w185${p.profilePath}`} alt="" className="h-11 w-11 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span className="h-11 w-11 rounded-full" style={{ background: 'var(--chip)' }} />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-extrabold">{p.name}</div>
                    <div className="num text-[12px] font-semibold text-muted-foreground">
                      7일 {short(p.recentViews)} · 쇼츠 {p.recentShorts}
                      {p.growth != null && (
                        <span className="ml-1.5 font-bold" style={{ color: p.growth >= 0 ? 'var(--red)' : 'var(--text-faint)' }}>
                          {p.growth >= 0 ? '▲' : '▼'} {Math.abs(p.growth)}%
                        </span>
                      )}
                      {p.growth == null && <span className="ml-1.5 font-bold" style={{ color: 'var(--red)' }}>새로 뜸</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.works.map((w) => (
                    <Chip key={w.id}>
                      {w.title} <span className="num ml-1 opacity-70">{short(w.views)}</span>
                    </Chip>
                  ))}
                </div>
                {p.open.length > 0 && (
                  <div className="text-[12px] font-semibold text-muted-foreground">
                    <span className="font-bold" style={{ color: 'var(--green)' }}>
                      빈자리
                    </span>{' '}
                    {p.open.map((o) => `${o.title}${o.year ? `(${o.year})` : ''}`).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Loading>
    </>
  );
}

/* ───────────── 결 지도 ───────────── */

export function ToneView() {
  const { data, err } = useLoad(tonesAction);
  return (
    <>
      <Header title="결 지도" sub="최근 7일 쇼츠 조회를 장르(결)별로 — 한 작품을 했으면 같은 결의 다른 작품으로 트래픽 이어가기" />
      <Loading data={data} err={err} empty={(d) => d.length === 0}>
        {(groups) => (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {groups.map((g: ToneGroup) => (
              <div key={g.genre} className={card}>
                <div className="mb-2.5 flex items-baseline justify-between">
                  <h3 className="text-[16px] font-extrabold">{g.label}</h3>
                  <span className="num text-[12px] font-semibold text-muted-foreground">7일 {short(g.views)}</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {g.works.map((w) => (
                    <div key={w.id} className="w-[76px] shrink-0">
                      <Poster path={w.posterPath} title={w.title} w={76} />
                      <div className="mt-1 line-clamp-2 text-[11.5px] font-bold leading-snug">{w.title}</div>
                      <div className="num text-[11px] font-semibold text-[color:var(--text-faint)]">{short(w.views)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Loading>
    </>
  );
}

/* ───────────── 편성표 ───────────── */

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(date: string) {
  const d = new Date(date + 'T00:00:00+09:00');
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 33 * 3_600_000).toISOString().slice(0, 10);
  const base = `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY[d.getDay()]})`;
  return date === today ? `오늘 ${base}` : date === tomorrow ? `내일 ${base}` : base;
}

export function ScheduleView() {
  const { data, err } = useLoad(scheduleAction);
  return (
    <>
      <Header title="편성표" sub="오늘부터 7일, 방영하는 한국 드라마·예능과 감시 채널 쇼츠 경쟁 — 첫 방송 직후를 선점" />
      <Loading data={data} err={err} empty={(d) => d.length === 0}>
        {(days) => (
          <div className="space-y-3">
            {days.map((d: ScheduleDay) => (
              <section key={d.date}>
                <h3 className="mb-1.5 px-1 text-[15px] font-extrabold">{dayLabel(d.date)}</h3>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {d.items.map((s) => (
                    <div key={s.id} className={card + ' flex gap-3 p-3'}>
                      <Poster path={s.posterPath} title={s.name} w={44} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-extrabold">{s.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <Chip>{CATEGORY_LABEL[s.category]}</Chip>
                          {s.networks.slice(0, 2).map((n) => (
                            <Chip key={n}>{n}</Chip>
                          ))}
                          {(s.nextAt === d.date ? s.nextEp : s.lastEp) && <Chip tone="brand">{s.nextAt === d.date ? s.nextEp : s.lastEp}</Chip>}
                        </div>
                        <div className="num mt-1 text-[12px] font-semibold text-muted-foreground">
                          {s.shorts === 0 ? (
                            <span className="font-bold" style={{ color: 'var(--green)' }}>
                              감시 채널 쇼츠 없음 — 빈자리
                            </span>
                          ) : (
                            <>
                              7일 쇼츠 {s.shorts} · 채널 {s.channels} · 최고 {short(s.maxViews)}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Loading>
    </>
  );
}

/* ───────────── 시즌·오픈 ───────────── */

const SEASON_KIND: Record<SeasonItem['kind'], string> = { new: '새로 시작', soon: '곧 시작', movie: '개봉' };

export function SeasonView() {
  const { data, err } = useLoad(seasonAction);
  return (
    <>
      <Header title="시즌·오픈" sub="최근 3주 새로 시작했거나 2주 안에 시작하는 한국 드라마·예능, 최근 한 달 개봉 한국 영화 — 첫 주 선점" />
      <Loading data={data} err={err} empty={(d) => d.length === 0}>
        {(items) => (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((s) => (
              <div key={s.workId} className={card + ' flex gap-3 p-3'}>
                <Poster path={s.posterPath} title={s.name} w={52} />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-[14px] font-extrabold leading-snug">{s.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Chip tone={s.kind === 'soon' ? 'amber' : 'brand'}>{SEASON_KIND[s.kind]}</Chip>
                    {s.firstAirDate && <Chip>{s.firstAirDate.slice(5).replace('-', '/')}</Chip>}
                    {s.networks.slice(0, 1).map((n) => (
                      <Chip key={n}>{n}</Chip>
                    ))}
                  </div>
                  <div className="num mt-1 text-[12px] font-semibold text-muted-foreground">
                    {s.shorts === 0 ? (
                      <span className="font-bold" style={{ color: 'var(--green)' }}>
                        쇼츠 아직 없음
                      </span>
                    ) : (
                      <>
                        쇼츠 {s.shorts} · 채널 {s.channels} · 최고 {short(s.maxViews)}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Loading>
    </>
  );
}

/* ───────────── 황금키워드 ───────────── */

export function GoldenView() {
  const { data, err } = useLoad(goldenAction);
  return (
    <>
      <Header title="황금키워드" sub="네이버 검색은 많은데 감시 채널 쇼츠는 적은 작품·배우 — 검색수 ÷ (최근 7일 쇼츠 수 + 1)" />
      <Loading data={data} err={err} empty={(d) => d.rows.length === 0}>
        {(d) => (
          <>
            {!d.enabled && (
              <div className="surface-warn mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold">
                네이버 검색광고 키가 없어 검색수를 못 가져왔습니다 (설정 → API 키).
              </div>
            )}
            <div className="card-surface theme-fade overflow-hidden rounded-[20px]">
              <div className="grid grid-cols-[minmax(0,1fr)_88px_70px_70px_80px] gap-2 border-b px-4 py-2 text-[11.5px] font-bold text-[color:var(--text-faint)]" style={{ borderColor: 'var(--chip)' }}>
                <span>키워드</span>
                <span className="text-right">월 검색수</span>
                <span className="text-right">7일 쇼츠</span>
                <span className="text-right">채널</span>
                <span className="text-right">점수</span>
              </div>
              {d.rows.slice(0, 80).map((r: GoldenRow) => (
                <div key={r.kind + r.keyword} className="grid grid-cols-[minmax(0,1fr)_88px_70px_70px_80px] items-center gap-2 border-b px-4 py-2 text-[13px] last:border-0" style={{ borderColor: 'var(--chip)' }}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Chip>{r.kind === 'work' ? '작품' : '배우'}</Chip>
                    <span className="truncate font-bold">{r.keyword}</span>
                  </span>
                  <span className="num text-right font-semibold">{r.volume != null ? short(r.volume) : '–'}</span>
                  <span className="num text-right font-semibold">{r.shorts7d}</span>
                  <span className="num text-right font-semibold">{r.channels7d}</span>
                  <span className="num text-right font-extrabold" style={r.score != null && r.score >= 5000 ? { color: 'var(--accent-solid)' } : undefined}>
                    {r.score != null ? short(r.score) : '–'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Loading>
    </>
  );
}

/* ───────────── 속도전 ───────────── */

export function SpeedView() {
  const { data, err } = useLoad(speedAction);
  return (
    <>
      <Header title="속도전" sub="방영 중 작품의 최근 회차 뒤 누가 얼마나 빨리 올렸는지 — 방송 다음 날까지 올린 쇼츠 vs 그 뒤" />
      <Loading data={data} err={err} empty={(d) => d.length === 0}>
        {(rows) => (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {rows.map((r: SpeedRow) => (
              <div key={r.work.id} className={card + ' space-y-2.5'}>
                <div className="flex items-start gap-3">
                  <Poster path={r.work.posterPath} title={r.work.title} w={44} />
                  <div className="min-w-0 flex-1">
                    <WorkLine w={r.work} />
                    <div className="num mt-1 text-[12px] font-semibold text-muted-foreground">
                      최근 회차 {r.episodeDate.slice(5).replace('-', '/')} · 빨리 올린 쇼츠 평균 {r.earlyAvg != null ? short(r.earlyAvg) : '–'} · 그 뒤{' '}
                      {r.lateAvg != null ? short(r.lateAvg) : '–'}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {r.uploads.map((v) => (
                    <VideoRow key={v.id} v={v} extra={<> · 방송일 +{v.hoursAfter}시간</>} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Loading>
    </>
  );
}

/* ───────────── 시상식 ───────────── */

export function AwardsView() {
  const { data, err } = useLoad(awardsAction);
  const month = new Date().getMonth() + 1;
  return (
    <>
      <Header title="시상식" sub="시상식·수상소감·레드카펫 쇼츠 — 최근 것과, 과거 트래픽에 남은 예전 시상식 히트 (해마다 같은 때 또 터진다)" />
      <Loading data={data} err={err}>
        {(d) => (
          <div className="space-y-3">
            <div className={card}>
              <h3 className="mb-2 text-[14px] font-extrabold">해마다 이맘때</h3>
              <div className="flex flex-wrap gap-1.5">
                {d.calendar.map((c) => (
                  <Chip key={c.month} tone={c.month === month || c.month === month + 1 ? 'brand' : 'plain'}>
                    {c.month}월 · {c.names}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className={card}>
                <h3 className="mb-2 text-[14px] font-extrabold">최근 시상식 쇼츠</h3>
                {d.recent.length === 0 ? (
                  <p className="text-[13px] font-semibold text-muted-foreground">감시 채널에 최근 시상식 쇼츠가 없습니다</p>
                ) : (
                  <div className="space-y-1.5">
                    {d.recent.map((v) => (
                      <VideoRow key={v.id} v={v} />
                    ))}
                  </div>
                )}
              </div>
              <div className={card}>
                <h3 className="mb-2 text-[14px] font-extrabold">과거 시상식 히트 (100만+)</h3>
                {d.past.length === 0 ? (
                  <p className="text-[13px] font-semibold text-muted-foreground">과거 트래픽에 아직 시상식 영상이 없습니다 (끊긴 채널 정리가 진행되면 쌓입니다)</p>
                ) : (
                  <div className="space-y-1.5">
                    {d.past.map((v) => (
                      <VideoRow key={v.id} v={v} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Loading>
    </>
  );
}

/* ───────────── 홈 ───────────── */

export function HomeView({ onOpen }: { onOpen: (view: string) => void }) {
  const { data, err } = useLoad(homeAction);
  return (
    <>
      <Header title="오늘 뭐 만들까" sub="지금 터지는 쇼츠 · 뜨는 작품과 꿀통 연관작 · 오늘 편성 · 작년 이맘때 터진 영상" />
      <Loading data={data} err={err}>
        {(d) => (
          <div className="space-y-3">
            <Section title="지금 터지는 쇼츠 (최근 3시간)" more="터진 영상" onMore={() => onOpen('hot')}>
              {d.hot.length === 0 ? (
                <p className="text-[13px] font-semibold text-muted-foreground">아직 시간별 조회수가 쌓이는 중입니다</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {d.hot.slice(0, 10).map((v: HotVideo) => (
                    <div key={v.id} className="min-w-0">
                      <VideoThumb id={v.id} src={v.thumbnailUrl} vertical className="w-full">
                        <span className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0) 50%)' }} />
                        <span className="num absolute bottom-1.5 left-2 text-[15px] font-extrabold text-white">{short(v.views)}</span>
                      </VideoThumb>
                      <div className="mt-1 line-clamp-2 text-[12px] font-bold leading-snug">{v.title}</div>
                      {v.work && <div className="truncate text-[11px] font-bold" style={{ color: 'var(--accent-solid)' }}>{v.work}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <div className="grid gap-3 lg:grid-cols-2">
              <Section title="뜨는 작품 (3일)" more="막 뜨는 작품·연관 꿀통" onMore={() => onOpen('rising')}>
                <RisingList d={d.works} />
              </Section>
              <Section title="오늘·내일 편성" more="편성표" onMore={() => onOpen('schedule')}>
                {d.schedule.length === 0 ? (
                  <p className="text-[13px] font-semibold text-muted-foreground">편성 정보를 불러오지 못했습니다</p>
                ) : (
                  <div className="space-y-1.5">
                    {d.schedule.flatMap((day) =>
                      day.items.slice(0, 5).map((s) => (
                        <div key={day.date + s.id} className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="min-w-0 truncate font-bold">
                            <span className="mr-1.5 text-[11.5px] font-semibold text-[color:var(--text-faint)]">{dayLabel(day.date).split(' ')[0]}</span>
                            {s.name}
                          </span>
                          <span className="num shrink-0 text-[12px] font-semibold text-muted-foreground">
                            {s.shorts === 0 ? '쇼츠 없음' : `쇼츠 ${s.shorts} · 채널 ${s.channels}`}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </Section>
            </div>
            <Section title="작년 이맘때 터진 영상 (과거 트래픽)" more="과거 트래픽" onMore={() => onOpen('past')}>
              {d.past.length === 0 ? (
                <p className="text-[13px] font-semibold text-muted-foreground">과거 트래픽이 쌓이면 나옵니다 (끊긴 채널을 매일 조금씩 정리 중)</p>
              ) : (
                <div className="grid gap-1.5 md:grid-cols-2">
                  {d.past.map((v) => (
                    <VideoRow key={v.id} v={v} />
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </Loading>
    </>
  );
}

function Section({ title, more, onMore, children }: { title: string; more: string; onMore: () => void; children: React.ReactNode }) {
  return (
    <section className={card}>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-extrabold">{title}</h3>
        <button onClick={onMore} className="text-[12px] font-bold text-muted-foreground hover:text-foreground">
          {more} ›
        </button>
      </div>
      {children}
    </section>
  );
}

function RisingList({ d }: { d: RadarData }) {
  if (d.rising.length === 0) return <p className="text-[13px] font-semibold text-muted-foreground">작품을 찾은 쇼츠가 쌓이면 나옵니다 (작품 인식 {d.summary.matchRate}%)</p>;
  return (
    <div className="space-y-2">
      {d.rising.slice(0, 5).map((w) => {
        const honey = w.related.filter((r) => r.maxViews >= 300_000 && r.channels <= 2).slice(0, 2);
        return (
          <div key={w.key} className="flex items-center gap-2.5">
            <Poster path={w.poster} title={w.title} w={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-extrabold">{w.title}</div>
              <div className="num truncate text-[11.5px] font-semibold text-muted-foreground">
                쇼츠 {w.recentShorts} · {short(w.recentViews)} · 채널 {w.channels}
                {honey.length > 0 && <span style={{ color: 'var(--green)' }}> · 꿀통 {honey.map((h) => h.title).join(', ')}</span>}
              </div>
            </div>
            <Chip>{CATEGORY_LABEL[w.category as WorkCategory]}</Chip>
          </div>
        );
      })}
    </div>
  );
}
