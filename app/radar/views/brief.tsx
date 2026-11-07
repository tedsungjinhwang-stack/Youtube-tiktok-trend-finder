'use client';

import { useEffect, useState } from 'react';
import type { Brief, BriefInput } from '@/lib/radar/brief';
import type { ChannelHighlight, PackOutlook } from '@/lib/radar/outlook';
import { Chip, Empty, ago, short } from './parts';
import { runJob, sinceStart, waitForJob, type JobState } from './job';
import { PlaybookAi, PlaybookBoard } from './playbook';

/**
 * AI 브리핑 — 뜨는 인물·작품을 Claude 가 유튜브 수치·구글 급상승·기사·TMDB 로 엮어 분석한다.
 * 버튼을 눌러야 새로 만든다 (한 번에 1~3분, Claude 비용). 마지막 결과는 저장해 두고 다시 연다.
 */

const HEAT_TONE: Record<string, 'red' | 'amber' | 'plain' | 'green'> = { 상승: 'red', 정점: 'amber', '식는 중': 'plain', 유지: 'amber', 하락: 'plain' };

export function BriefView() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number>(0);

  // 분석은 서버에서 백그라운드로 돈다 — 화면은 끝났는지 몇 초마다 묻기만 (연결이 끊겨도 결과는 남는다)
  const pick = (d: { brief?: Brief | null }) => d.brief ?? null;
  const follow = async (p: Promise<Brief>) => {
    setBusy(true);
    setErr(null);
    try {
      setBrief(await p);
    } catch (e) {
      if ((e as Error).message !== 'cancelled') setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    fetch('/api/radar/brief')
      .then((r) => r.json())
      .then((d: { brief: Brief | null; hasKey: boolean; job?: JobState | null }) => {
        if (!alive) return;
        setBrief(d.brief);
        setHasKey(d.hasKey);
        // 다른 탭·기기에서 시작한 분석이 아직 돌고 있으면 이어서 기다린다
        if (d.job?.status === 'running') {
          setStartedAt(Date.now() - sinceStart(d.job) * 1000);
          follow(waitForJob('/api/radar/brief', pick, () => alive));
        } else if (d.job?.status === 'error' && d.job.finishedAt && Date.now() - new Date(d.job.finishedAt).getTime() < 15 * 60_000) {
          setErr(`지난 분석이 실패했습니다 — ${d.job.error ?? ''}`);
        }
      })
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 화면을 열 때 한 번
  }, []);

  useEffect(() => {
    if (!busy) return;
    const tick = () => setElapsed(Math.round((Date.now() - (startedAt || Date.now())) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [busy, startedAt]);

  const run = () => {
    setStartedAt(Date.now());
    setElapsed(0);
    follow(runJob('/api/radar/brief', pick));
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">AI 종합 분석</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            뜨는 카테고리·키워드·인물·작품, 계절, 공개 예정작 — 채널팩 조회수 · 구글 급상승 · 기사 · TMDB · 편성을 Claude 가 엮어 오늘 찍을 쇼츠까지.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brief && (
            <span className="text-[12px] font-semibold text-[color:var(--text-faint)]">
              {ago(brief.generatedAt)} 분석 · 약 {brief.costKrw.toLocaleString('ko-KR')}원
            </span>
          )}
          <button
            onClick={run}
            disabled={busy || hasKey === false}
            className="h-9 rounded-xl bg-brand px-4 text-[13px] font-bold text-brand-foreground disabled:opacity-50"
          >
            {busy ? `분석 중… ${elapsed}초` : brief ? '다시 분석' : '지금 분석'}
          </button>
        </div>
      </div>

      {hasKey === false && (
        <div className="surface-warn mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold">
          Claude API 키가 아직 없습니다 —{' '}
          <a href="/settings/api-keys" className="underline">
            설정 → API 키
          </a>
          에서 「Claude API」에 키(sk-ant-…)를 넣으면 분석할 수 있습니다.
        </div>
      )}
      {busy && (
        <div className="card-surface mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold text-muted-foreground">
          채널팩 조회수·키워드·구글 급상승·기사·TMDB·편성을 모아 Claude 에게 보내는 중입니다. 2~4분 걸립니다. 서버에서 계속 돌기 때문에
          화면을 닫거나 다른 탭으로 가도 됩니다 — 돌아오면 결과가 있습니다.
        </div>
      )}
      {err && (
        <div className="mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold" style={{ color: 'var(--red)' }}>
          {err}
        </div>
      )}

      <OutlookBoard />
      <PlaybookBoard />

      {!brief ? (
        <Empty>{hasKey === null ? '불러오는 중…' : '아직 브리핑이 없습니다. 「지금 분석」을 누르세요.'}</Empty>
      ) : (
        <BriefBody brief={brief} />
      )}
    </>
  );
}

type SortKey = 'score' | 'growthPct' | 'risingPct' | 'channelMedianViews' | 'viewsPerUpload' | 'youngSuccessPct' | 'top3SharePct' | 'dailyViews';
const COLS: { key: SortKey; label: string; title: string }[] = [
  { key: 'score', label: '기회', title: '오름세 20 · 오른 채널 10 · 채널 성과 30 · 영상당 몫 5 · 신생 성공률 25 · 열린 판 10 (표본 적으면 50 쪽으로)' },
  { key: 'dailyViews', label: '하루 조회', title: '팩 채널들의 하루 조회수 합' },
  { key: 'growthPct', label: '오름세(시장 대비)', title: '채널별 하루 조회 증가율의 중앙값이 전체 채널 중앙값보다 몇 % 높나 — 큰 채널 하나가 터진 건 반영 안 됨' },
  { key: 'risingPct', label: '오른 채널', title: '시장보다 20% 넘게 더 오른 채널 비율' },
  { key: 'channelMedianViews', label: '채널 성과', title: '채널마다 최근 7일 영상 조회 중앙값 → 그 중앙값' },
  { key: 'viewsPerUpload', label: '영상당 몫', title: '팩 하루 조회 ÷ 하루 새 영상 수 — 공급 대비 수요' },
  { key: 'youngSuccessPct', label: '신생 성공률', title: '개설 1년 이내 채널 중 최근 영상 중앙값 1만+ 비율 (표본 적으면 전체 평균 쪽으로)' },
  { key: 'top3SharePct', label: '상위3 쏠림', title: '상위 3채널이 팩 조회에서 차지하는 비중 — 낮을수록 열린 판' },
];

const pct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`);

/** 카테고리 기회판 — AI 없이 계산 (1시간마다 새로) */
function OutlookBoard() {
  const [rows, setRows] = useState<PackOutlook[] | null>(null);
  const [sort, setSort] = useState<SortKey>('score');
  const [all, setAll] = useState(false);
  // 기본은 한국어 채널만 (외국어 채널은 점수·목록에서 뺀다)
  const [foreign, setForeign] = useState(false);
  useEffect(() => {
    fetch('/api/radar/outlook' + (foreign ? '?foreign=1' : ''))
      .then((r) => r.json())
      .then((d: { ok: boolean; rows?: PackOutlook[] }) => setRows(d.rows ?? []))
      .catch(() => setRows([]));
  }, [foreign]);
  if (!rows?.length) return null;
  const foreignTotal = rows.reduce((a, r) => a + (r.foreignChannels ?? 0), 0);
  const toggle = (
    <button
      onClick={() => setForeign(!foreign)}
      className="h-7 rounded-lg px-2.5 text-[12px] font-bold"
      style={foreign ? { background: 'var(--accent-solid)', color: 'var(--on-accent, #fff)' } : { background: 'var(--chip)' }}
      title="외국어 채널 = 채널 이름에 한글이 없고, 수집한 영상 제목 중 한글이 든 비율도 30% 미만"
    >
      {foreign ? '외국어 채널 포함 중' : '외국어 채널 포함'}
    </button>
  );
  const val = (r: PackOutlook) => (r[sort] ?? -1e12) as number;
  const sorted = [...rows].sort((a, b) => (sort === 'top3SharePct' ? val(a) - val(b) : val(b) - val(a)));
  const shown = all ? sorted : sorted.slice(0, 15);
  const top5 = rows.slice(0, 5);
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-muted-foreground">
        {toggle}
        <span>
          {foreign
            ? '외국어 채널까지 넣어 계산한 점수입니다.'
            : `한국 시장 기준 — 외국어 채널 ${foreignTotal.toLocaleString()}곳은 점수·잘 나온 채널·대박 신생에서 뺐습니다.`}
        </span>
      </div>
      <Section title="떡상 카테고리 TOP 5">
        <div className="grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
          {top5.map((p, i) => (
            <Card key={p.pack}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="num text-[13px] font-black text-[color:var(--text-faint)]">#{i + 1}</span>
                <span className="text-[16px] font-extrabold">{p.pack}</span>
                <Chip tone="brand">기회 {p.score}</Chip>
                {p.reuseRisk && <Chip tone="amber" title="남의 영상을 편집하는 팩">저작권 주의</Chip>}
              </div>
              <div className="num mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] font-semibold text-muted-foreground">
                <span>오름세(시장 대비) {pct(p.growthPct)}</span>
                <span>오른 채널 {p.risingPct ?? '—'}%</span>
                <span>채널 성과 {p.channelMedianViews != null ? short(p.channelMedianViews) : '—'}</span>
                <span>영상당 몫 {short(p.viewsPerUpload)}</span>
                <span>
                  신생 성공 {p.youngSuccess}/{p.youngChannels}
                </span>
                <span>상위3 {p.top3SharePct}%</span>
              </div>
              <ChannelList label="최근 잘 나온 채널" items={p.hot ?? []} />
              <ChannelList label="대박 신생" items={p.rookieList ?? []} empty="이 팩엔 아직 없음" />
            </Card>
          ))}
        </div>
      </Section>

      <Section title="카테고리 기회판">
        <div className="card-surface theme-fade overflow-x-auto rounded-[18px]">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[11.5px] font-extrabold text-[color:var(--text-faint)]">
                <th className="px-3 py-2">카테고리</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-right">
                    <button title={c.title} onClick={() => setSort(c.key)} className={sort === c.key ? 'text-foreground' : 'hover:text-foreground'}>
                      {c.label}
                      {sort === c.key ? ' ▾' : ''}
                    </button>
                  </th>
                ))}
                <th className="px-2 py-2 text-right">대박 신생</th>
              </tr>
            </thead>
            <tbody className="num font-semibold">
              {shown.map((r) => (
                <tr key={r.pack} className="border-t" style={{ borderColor: 'var(--chip)' }}>
                  <td className="px-3 py-1.5 font-bold">
                    {r.pack}
                    {r.reuseRisk && <span className="ml-1 text-[11px]" style={{ color: 'var(--amber)' }} title="남의 영상을 편집하는 팩 — 저작권 주의">©</span>}
                    <span className="ml-1 text-[11px] font-semibold text-[color:var(--text-faint)]">
                      {r.channels}곳{!foreign && r.foreignChannels ? ` (외국어 ${r.foreignChannels} 제외)` : ''} · 쇼츠 {r.shortsPct}%
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span
                      className="inline-block min-w-[34px] rounded-md px-1.5 text-center font-extrabold"
                      style={r.score >= 70 ? { background: 'var(--accent-solid)', color: 'var(--on-accent, #fff)' } : { background: 'var(--chip)' }}
                    >
                      {r.score}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{short(r.dailyViews)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: (r.growthPct ?? 0) > 10 ? 'var(--red)' : (r.growthPct ?? 0) < -10 ? 'var(--text-faint)' : undefined }}>
                    {pct(r.growthPct)}
                  </td>
                  <td className="px-2 py-1.5 text-right">{r.risingPct == null ? '—' : `${r.risingPct}%`}</td>
                  <td className="px-2 py-1.5 text-right">{r.channelMedianViews == null ? '—' : short(r.channelMedianViews)}</td>
                  <td className="px-2 py-1.5 text-right">{short(r.viewsPerUpload)}</td>
                  <td className="px-2 py-1.5 text-right" title={`신생 ${r.youngChannels}곳 중 ${r.youngSuccess}곳 성공`}>
                    {r.youngSuccessPct}% <span className="text-[10.5px] text-[color:var(--text-faint)]">({r.youngSuccess}/{r.youngChannels})</span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{r.top3SharePct}%</td>
                  <td className="px-2 py-1.5 text-right">{r.rookies || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 15 && (
            <button onClick={() => setAll(!all)} className="w-full py-2 text-[12.5px] font-bold text-muted-foreground hover:text-foreground">
              {all ? '접기' : `전체 ${rows.length}개 보기`}
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px] font-semibold text-[color:var(--text-faint)]">
          채널 단위로 계산 — 큰 채널 하나가 터진 건 팩 오름세에 안 들어가고, 오름세는 전체 채널 대비입니다. 비교 기간: {rows[0]?.growthBasis}. 기회 점수 = 채널 성과 30 · 신생 성공률 25 · 오름세 20 · 오른 채널 10 · 열린 판 10 · 영상당 몫 5 (조회 크기는 로그 척도, 나머지는 팩끼리 순위, 표본이 적은 팩은 50 쪽으로). © = 남의 영상 편집 팩. 머리글을 누르면 정렬.
        </p>
      </Section>
    </>
  );
}

function ChannelList({ label, items, empty }: { label: string; items: ChannelHighlight[]; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <div className="mt-2.5">
      <div className="mb-1 text-[11.5px] font-extrabold text-[color:var(--text-faint)]">{label}</div>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((c) => (
            <li key={c.externalId} className="flex min-w-0 items-baseline gap-1.5 text-[12.5px]">
              <a href={`https://www.youtube.com/channel/${c.externalId}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate font-bold hover:underline">
                {c.name}
              </a>
              {c.rookie ? <Chip tone="green">대박 신생</Chip> : c.young ? <Chip>신생</Chip> : null}
              <span className="num ml-auto shrink-0 text-[11.5px] font-semibold text-muted-foreground">
                영상 중앙값 {short(c.medianViews)} · 하루 {short(c.dailyViews)}
                {c.growthPct != null && ` (${c.growthPct > 0 ? '+' : ''}${c.growthPct}%)`}
                {c.subscribers != null && ` · 구독 ${short(c.subscribers)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-[17px] font-extrabold tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  );
}

function Picks({ label, items }: { label: string; items: { title: string; reason: string; actor?: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11.5px] font-extrabold text-[color:var(--text-faint)]">{label}</div>
      <ul className="space-y-1">
        {items.map((p, i) => (
          <li key={i} className="text-[12.5px] leading-snug">
            <strong className="font-bold">{p.actor ? `${p.actor} · ` : ''}{p.title}</strong>
            <span className="text-muted-foreground"> — {p.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ideas({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 rounded-lg px-3 py-2" style={{ background: 'var(--chip)' }}>
      <div className="mb-1 text-[11.5px] font-extrabold text-[color:var(--text-faint)]">쇼츠 기획</div>
      <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] font-semibold leading-snug">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function News({ items }: { items: BriefInput['persons'][number]['news'] }) {
  if (!items?.length) return null;
  return (
    <details className="mt-2 text-[12px]">
      <summary className="cursor-pointer font-bold text-muted-foreground">관련 기사 {items.length}건</summary>
      <ul className="mt-1 space-y-0.5">
        {items.map((n, i) => (
          <li key={i} className="truncate">
            <a href={n.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {n.title}
            </a>
            <span className="text-[color:var(--text-faint)]"> · {n.source}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="card-surface theme-fade rounded-[18px] p-4">{children}</div>;
}

function BriefBody({ brief }: { brief: Brief }) {
  const { result, input } = brief;
  const pIn = new Map(input.persons.map((p) => [p.name, p]));
  const wIn = new Map(input.works.map((w) => [w.title, w]));
  return (
    <>
      <div className="card-surface theme-fade mb-4 rounded-[22px] px-5 py-4 text-[15px] font-bold leading-relaxed">{result.headline}</div>

      {result.playbook && <PlaybookAi pb={result.playbook} />}

      {(result.promising ?? []).length > 0 && (
        <Section title="유망 카테고리 — 지금 들어갈 곳">
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {result.promising.map((c) => {
              const src = (input.outlook ?? []).find((p) => p.pack === c.pack);
              return (
                <Card key={c.pack}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[15px] font-extrabold">{c.pack}</span>
                    <Chip tone={c.verdict === '강력 추천' ? 'red' : c.verdict === '추천' ? 'amber' : 'plain'}>{c.verdict}</Chip>
                    {src && <span className="num text-[11.5px] font-semibold text-[color:var(--text-faint)]">기회 {src.score}</span>}
                  </div>
                  <p className="mt-1.5 text-[12.5px] font-semibold leading-snug">{c.why}</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">진입 → {c.entry}</p>
                  {c.risk && (
                    <p className="mt-1 text-[12px] font-semibold" style={{ color: 'var(--amber)' }}>
                      위험 — {c.risk}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {(result.categories ?? []).length > 0 && (
        <Section title="카테고리 흐름">
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {result.categories.map((c) => {
              const src = (input.packs ?? []).find((p) => p.pack === c.pack);
              return (
                <Card key={c.pack}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[15px] font-extrabold">{c.pack}</span>
                    <Chip tone={HEAT_TONE[c.trend] ?? 'plain'}>{c.trend}</Chip>
                    {src && (
                      <span className="num text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                        하루 {short(src.dailyViews)}
                        {src.growthPct != null && ` (${src.growthPct > 0 ? '+' : ''}${src.growthPct}%)`} · 새 영상 {src.newVideos48h}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12.5px] font-semibold leading-snug">{c.why}</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">→ {c.angle}</p>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      {(result.keywords ?? []).length > 0 && (
        <Section title="뜨는 키워드">
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {result.keywords.map((k) => {
              const src = (input.keywords ?? []).find((x) => x.word === k.keyword.replace(/^#/, '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''));
              return (
                <Card key={k.keyword}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-extrabold">#{k.keyword.replace(/^#/, '')}</span>
                    {src && (
                      <span className="num text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                        영상 {src.videos} (일주일 전 {src.videosWeekAgo}) · 채널 {src.channels}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] font-semibold leading-snug">{k.why}</p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">→ {k.angle}</p>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="뜨는 인물">
        <div className="grid gap-2.5 lg:grid-cols-2">
          {result.persons.map((p) => {
            const src = pIn.get(p.name);
            return (
              <Card key={p.name}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[16px] font-extrabold">{p.name}</span>
                  <Chip tone={HEAT_TONE[p.heat] ?? 'plain'}>{p.heat}</Chip>
                  {src && (
                    <span className="num text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                      채널 {src.channels} · 영상 {src.videos} · 24시간 +{short(src.gain24h)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] font-semibold leading-snug">{p.why}</p>
                {p.evidence.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[12px] text-muted-foreground">
                    {p.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
                <Picks label="같이 탈 작품" items={p.relatedWorks} />
                <Ideas items={p.ideas} />
                {p.caution && (
                  <p className="mt-2 text-[12px] font-semibold" style={{ color: 'var(--amber)' }}>
                    주의 — {p.caution}
                  </p>
                )}
                <News items={src?.news ?? []} />
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="뜨는 작품">
        <div className="grid gap-2.5 lg:grid-cols-2">
          {result.works.map((w) => {
            const src = wIn.get(w.title) ?? input.works.find((x) => x.title.startsWith(w.title) || w.title.startsWith(x.title));
            return (
              <Card key={w.title}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[16px] font-extrabold">{w.title}</span>
                  {src && <Chip>{src.kind}</Chip>}
                  {src?.onAir && <Chip tone="green">방영 중</Chip>}
                  {src && (
                    <span className="num text-[11.5px] font-semibold text-[color:var(--text-faint)]">
                      채널 {src.channels} · 영상 {src.videos} · 24시간 +{short(src.gain24h)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] font-semibold leading-snug">{w.why}</p>
                {w.evidence.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-[12px] text-muted-foreground">
                    {w.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
                <Picks label="결이 맞는 작품" items={w.sameTone} />
                <Picks label="같은 배우" items={w.sameActor} />
                <Ideas items={w.ideas} />
                {w.caution && (
                  <p className="mt-2 text-[12px] font-semibold" style={{ color: 'var(--amber)' }}>
                    주의 — {w.caution}
                  </p>
                )}
                <News items={src?.news ?? []} />
              </Card>
            );
          })}
        </div>
      </Section>

      {result.season && (
        <Section title="계절·시기">
          <Card>
            <p className="text-[13px] font-semibold leading-relaxed">{result.season.summary}</p>
            <Ideas items={result.season.ideas} />
            {(input.season?.pastSameSeason ?? []).length > 0 && (
              <details className="mt-2 text-[12px]">
                <summary className="cursor-pointer font-bold text-muted-foreground">작년 이맘때 터진 영상 {input.season.pastSameSeason.length}개</summary>
                <ul className="mt-1 space-y-0.5">
                  {input.season.pastSameSeason.map((p, i) => (
                    <li key={i} className="truncate">
                      {p.year} · {short(p.views)} · {p.title}
                      {p.pack && <span className="text-[color:var(--text-faint)]"> · {p.pack}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </Section>
      )}

      {(result.upcoming ?? []).length > 0 && (
        <Section title="공개 예정 — 미리 준비">
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {result.upcoming.map((u, i) => (
              <Card key={i}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[15px] font-extrabold">{u.title}</span>
                  {u.platform && <Chip>{u.platform}</Chip>}
                  <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">{u.when}</span>
                </div>
                <p className="mt-1.5 text-[12.5px] font-semibold leading-snug">{u.why}</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">준비 → {u.prep}</p>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {result.googleOpportunities.length > 0 && (
        <Section title="구글 급상승 — 선점 기회">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {result.googleOpportunities.map((g, i) => {
              const src = input.google.find((x) => x.query === g.query);
              return (
                <Card key={i}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-extrabold">{g.query}</span>
                    {src && <Chip tone="red">{short(src.volume)}+ 검색</Chip>}
                  </div>
                  <p className="mt-1 text-[12.5px] font-semibold text-muted-foreground">{g.angle}</p>
                </Card>
              );
            })}
          </div>
        </Section>
      )}

      <p className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">
        {brief.model} · 입력 {brief.usage.input.toLocaleString('ko-KR')} · 출력 {brief.usage.output.toLocaleString('ko-KR')} 토큰 · 약{' '}
        {brief.costKrw.toLocaleString('ko-KR')}원. 사실 관계는 기사 링크로 한 번 더 확인하세요.
      </p>
    </>
  );
}
