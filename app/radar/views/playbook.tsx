'use client';

import { useEffect, useState } from 'react';
import type { BriefResult } from '@/lib/radar/brief';
import type { Playbook, RevivalWork } from '@/lib/radar/playbook';
import { CATEGORY_LABEL, type WorkCategory } from '@/lib/radar/types';
import { Chip, ago, short } from './parts';

/**
 * 플레이북 화면 — 「잘되는 자리를 데이터로 찾고 → 형식·구성만 가져와 → 한 가지만 바꾸고 → 검증된 소재로」.
 * 양산형 레이더 · 형식 신호 · 부활 후보 작품은 AI 없이 우리 채널팩·조회수로 계산 (1시간마다 새로).
 */

const TMDB_IMG = process.env.NEXT_PUBLIC_TMDB_IMG_BASE || 'https://image.tmdb.org/t/p';

export function usePlaybook(): Playbook | null {
  const [pb, setPb] = useState<Playbook | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/radar/playbook')
      .then((r) => r.json())
      .then((d: { ok: boolean } & Playbook) => alive && d.ok && setPb(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return pb;
}

function H2({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-[17px] font-extrabold tracking-[-0.02em]">{title}</h2>
      <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">{sub}</p>
    </div>
  );
}

const fmtLabel = (sec: number | null) => (sec == null ? '' : sec <= 60 ? '숏폼' : sec <= 180 ? '미드폼' : '롱폼');
const LAYOUT_LABEL: Record<string, string> = {
  insta: '인스타형',
  titlebar: '일반형 제목바',
  full: '풀화면',
  split: '위아래 분할',
  text: '글·캡처형',
  talk: '인물 토크형',
  ai: 'AI 이미지',
  ranking: '랭킹형',
  other: '기타',
};

/** AI 종합 분석 화면 — 양산형 레이더 · 형식 신호 · 부활 후보 */
export function PlaybookBoard() {
  const pb = usePlaybook();
  const [all, setAll] = useState(false);
  if (!pb) return null;
  const mass = all ? pb.mass : pb.mass.slice(0, 15);
  const formats = pb.formats.filter((f) => f.midVsShort >= 1.5).slice(0, 8);
  return (
    <>
      {pb.mass.length > 0 && (
        <section className="mb-4">
          <H2
            title="지금 밀어주는 자리 — 양산형 채널"
            sub={`구독 8만 이하 한국어 채널(공식·뉴스·대형 제외)을 하루 조회 순으로 — 이 채널들의 형식·구성을 가져오고 하나만 바꾸면 됩니다. ${ago(pb.generatedAt)} 계산`}
          />
          <div className="card-surface theme-fade overflow-x-auto rounded-[18px]">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[11.5px] font-extrabold text-[color:var(--text-faint)]">
                  <th className="px-3 py-2">채널</th>
                  <th className="px-2 py-2 text-right" title="최근 3일 하루 조회 증가의 중앙값">하루 조회</th>
                  <th className="px-2 py-2 text-right" title="최근 14일 영상(올린 지 하루+) 조회 중앙값">영상 중앙값</th>
                  <th className="px-2 py-2 text-right" title="영상 조회의 바닥(하위 25%) — 1주 전보다 오르면 채널력이 붙는 중">바닥 · 추세</th>
                  <th className="px-2 py-2" title="최근 14일 영상 길이 비율">형식</th>
                  <th className="px-2 py-2">대표 영상</th>
                </tr>
              </thead>
              <tbody className="num font-semibold">
                {mass.map((m) => (
                  <tr key={m.externalId} className="border-t align-top" style={{ borderColor: 'var(--chip)' }}>
                    <td className="px-3 py-1.5">
                      <a
                        href={`https://www.youtube.com/channel/${m.externalId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold hover:underline"
                      >
                        {m.name}
                      </a>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <Chip>{m.pack}</Chip>
                        <span className="text-[11px] text-[color:var(--text-faint)]">구독 {m.subscribers != null ? short(m.subscribers) : '비공개'}</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-extrabold">{short(m.dailyViews)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {m.medianViews != null ? short(m.medianViews) : '—'}
                      <div className="text-[10.5px] text-[color:var(--text-faint)]">{m.videos14d}편</div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {m.floorViews != null ? short(m.floorViews) : '—'}
                      {m.floorTrendPct != null && (
                        <div>
                          {m.floorTrendPct >= 30 ? (
                            <Chip tone="green" title="바닥 조회가 1주 전보다 올랐습니다 — 채널력 신호">
                              채널력↑ +{m.floorTrendPct}%
                            </Chip>
                          ) : (
                            <span className="text-[10.5px] text-[color:var(--text-faint)]">
                              {m.floorTrendPct > 0 ? '+' : ''}
                              {m.floorTrendPct}%
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-[11.5px]">
                      {m.layout && (
                        <div className="mb-0.5 flex flex-wrap gap-1">
                          <Chip tone="brand" title="잘 나온 쇼츠 썸네일로 본 화면 구성">
                            {LAYOUT_LABEL[m.layout] ?? m.layout}
                          </Chip>
                          {(m.layoutTags ?? []).map((t) => (
                            <Chip key={t}>{t}</Chip>
                          ))}
                        </div>
                      )}
                      숏 {m.shortPct}%{m.midPct > 0 && <> · 미드 {m.midPct}%</>}
                      {m.longPct > 0 && <> · 롱 {m.longPct}%</>}
                    </td>
                    <td className="max-w-[300px] px-2 py-1.5">
                      {m.top && (
                        <a
                          href={`https://www.youtube.com/watch?v=${m.top.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="line-clamp-2 text-[12px] hover:underline"
                          title={m.top.title}
                        >
                          {m.top.title}
                          <span className="ml-1 text-[11px] text-[color:var(--text-faint)]">
                            {short(m.top.views)} · {fmtLabel(m.top.durationSec)}
                          </span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pb.mass.length > 15 && (
            <button onClick={() => setAll(!all)} className="mt-1.5 text-[12px] font-bold text-muted-foreground hover:text-foreground">
              {all ? '접기' : `${pb.mass.length}곳 모두 보기`}
            </button>
          )}
        </section>
      )}

      {formats.length > 0 && (
        <section className="mb-4">
          <H2 title="구성 차별화 신호 — 미드폼이 더 잘 나오는 팩" sub="최근 2~14일 영상 조회 중앙값: 59초 이하 vs 미드폼(1~3분). 미드폼을 쓰는 채널이 3곳 이상인 팩만" />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {formats.map((f) => (
              <div key={f.pack} className="card-surface theme-fade rounded-[16px] px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[14px] font-extrabold">{f.pack}</span>
                  <Chip tone="brand">미드폼 {f.midVsShort}배</Chip>
                </div>
                <div className="num mt-1 text-[12px] font-semibold text-muted-foreground">
                  59초 이하 {short(f.short.median)} ({f.short.n}편) → 미드폼 {short(f.mid.median)} ({f.mid.n}편 · {f.mid.channels}곳)
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <TemplateSection pb={pb} />

      <RevivalSection list={pb.revival} />
    </>
  );
}

/** 템플릿 신호 — 팩 안 화면 구성별 채널 수 · 채널 성과 */
function TemplateSection({ pb }: { pb: Playbook }) {
  const list = (pb.templates ?? []).filter((t) => t.classified >= 5);
  if (!list.length) {
    return pb.layoutClassified != null ? (
      <section className="mb-4">
        <H2 title="템플릿 신호" sub="팩마다 잘 나가는 채널의 쇼츠 썸네일을 Claude 가 보고 화면 구성(인스타형·일반형 제목바·풀화면·위아래 분할 등)을 분류하는 중입니다 — 2시간마다 조금씩 채워집니다." />
      </section>
    ) : null;
  }
  const strong = list.filter((t) => t.best && t.best.ratio >= 1.3);
  const rest = list.filter((t) => !(t.best && t.best.ratio >= 1.3));
  return (
    <section className="mb-4">
      <H2
        title="템플릿 신호 — 팩마다 잘 나오는 화면 구성"
        sub={`잘 나가는 채널의 쇼츠 썸네일을 Claude 가 보고 분류 (지금 ${pb.layoutClassified}곳, 2시간마다 늘어남). 채널 성과 = 최근 영상 조회 중앙값. 채널 3곳+ 인 구성끼리 비교`}
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {[...strong, ...rest].slice(0, 12).map((t) => (
          <div key={t.pack} className="card-surface theme-fade rounded-[16px] px-4 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[14px] font-extrabold">{t.pack}</span>
              {t.best && t.best.ratio >= 1.3 && <Chip tone="brand">{t.best.label} {t.best.ratio}배</Chip>}
              <span className="ml-auto text-[11px] font-semibold text-[color:var(--text-faint)]">{t.classified}곳</span>
            </div>
            <ul className="num mt-1.5 space-y-0.5 text-[12px] font-semibold">
              {t.layouts.slice(0, 4).map((l) => (
                <li key={l.layout} className="flex items-baseline gap-2">
                  <span className="min-w-[72px]">{l.label}</span>
                  <span className="text-muted-foreground">{l.channels}곳</span>
                  <span className="ml-auto">{short(l.medianViews)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 막 뜨는 작품 화면용 — 그 화면이 열릴 때만 불러온다 */
export function RevivalBlock({ cats }: { cats?: WorkCategory[] | null }) {
  const pb = usePlaybook();
  return pb ? <RevivalSection list={pb.revival} cats={cats} /> : null;
}

/** 부활 후보 작품 — 막 뜨는 작품 화면에서도 분류로 걸러 쓴다 */
export function RevivalSection({ list, cats }: { list: RevivalWork[]; cats?: WorkCategory[] | null }) {
  const rows = list.filter((r) => !cats?.length || cats.includes(r.category as WorkCategory)).slice(0, 12);
  if (!rows.length) return null;
  return (
    <section className="mb-4">
      <H2
        title="부활 후보 작품 — 터졌는데 지금 아무도 안 하는 작품"
        sub="최근 한 달 안에 30만+ 영상이 여러 채널에서 나왔는데, 지난 10일 동안은 다룬 채널이 1곳 이하. 영드짜는 작품 선정이 9할 — 경쟁 없는 작품으로"
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.workId} className="card-surface theme-fade flex gap-3 rounded-[16px] p-3">
            <span className="block shrink-0 overflow-hidden rounded-lg" style={{ width: 40, aspectRatio: '2 / 3', background: 'var(--chip)' }}>
              {r.posterPath && (
                // eslint-disable-next-line @next/next/no-img-element -- TMDB 포스터
                <img src={`${TMDB_IMG}/w185${r.posterPath}`} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-extrabold">{r.title}</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                <Chip>
                  {CATEGORY_LABEL[r.category as WorkCategory] ?? r.categoryLabel}
                  {r.year ? ` · ${r.year}` : ''}
                </Chip>
                <Chip tone={r.recentChannels === 0 ? 'green' : 'amber'}>{r.recentChannels === 0 ? '지금 0곳' : `지금 ${r.recentChannels}곳`}</Chip>
              </div>
              <div className="num mt-1 text-[11.5px] font-semibold text-muted-foreground">
                그때 최고 {short(r.pastMax)} · 30만+ {r.past300k}편 · {r.pastChannels}곳
              </div>
              {r.top && (
                <a
                  href={`https://www.youtube.com/watch?v=${r.top.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 line-clamp-1 text-[11.5px] font-semibold hover:underline"
                  title={`${r.top.title} · ${r.top.channel}`}
                >
                  {r.top.title}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** AI 종합 분석 결과의 플레이북 섹션 */
export function PlaybookAi({ pb }: { pb: NonNullable<BriefResult['playbook']> }) {
  const empty = !pb.benchmarks.length && !pb.formatPlays.length && !pb.revivals.length && !pb.switchOut.length;
  if (empty) return null;
  return (
    <section className="mb-4">
      <H2 title="플레이북 — 가져올 형식 · 바꿀 한 가지" sub="잘되는 양산형 채널의 형식·구성만 가져오고 하나만 바꾸기 · 구성 차별화 · 부활 작품 · 갈아탈 카테고리" />
      {pb.benchmarks.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {pb.benchmarks.map((b, i) => (
            <div key={b.channel + i} className="card-surface theme-fade space-y-1.5 rounded-[16px] p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[15px] font-extrabold">{b.channel}</span>
                <Chip>{b.pack}</Chip>
              </div>
              <p className="text-[12.5px] font-semibold leading-relaxed">
                <span className="font-extrabold">가져올 것</span> {b.copy}
              </p>
              <p className="text-[12.5px] font-semibold leading-relaxed" style={{ color: 'var(--accent-solid)' }}>
                <span className="font-extrabold">바꿀 한 가지</span> {b.change}
              </p>
              <p className="text-[12px] font-semibold text-muted-foreground">근거 — {b.evidence}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2.5 grid gap-2.5 lg:grid-cols-3">
        {pb.formatPlays.length > 0 && (
          <List title="구성 차별화" rows={pb.formatPlays.map((f) => ({ k: f.pack, v: f.insight }))} />
        )}
        {pb.revivals.length > 0 && <List title="부활 작품" rows={pb.revivals.map((r) => ({ k: r.title, v: `${r.why} — ${r.angle}` }))} />}
        {pb.switchOut.length > 0 && <List title="갈아탈 카테고리" tone="amber" rows={pb.switchOut.map((s) => ({ k: s.pack, v: `${s.why} → ${s.switchTo}` }))} />}
      </div>
    </section>
  );
}

function List({ title, rows, tone }: { title: string; rows: { k: string; v: string }[]; tone?: 'amber' }) {
  return (
    <div className="card-surface theme-fade rounded-[16px] p-4">
      <div className="mb-1.5 text-[13px] font-extrabold" style={tone === 'amber' ? { color: 'var(--amber)' } : undefined}>
        {title}
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.k + i} className="text-[12.5px] font-semibold leading-relaxed">
            <span className="font-extrabold">{r.k}</span> <span className="text-muted-foreground">{r.v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
