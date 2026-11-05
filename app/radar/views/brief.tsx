'use client';

import { useEffect, useState } from 'react';
import type { Brief, BriefInput } from '@/lib/radar/brief';
import { Chip, Empty, ago, short } from './parts';

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

  useEffect(() => {
    fetch('/api/radar/brief')
      .then((r) => r.json())
      .then((d: { brief: Brief | null; hasKey: boolean }) => {
        setBrief(d.brief);
        setHasKey(d.hasKey);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const run = async () => {
    setBusy(true);
    setElapsed(0);
    setErr(null);
    try {
      const r = await fetch('/api/radar/brief', { method: 'POST' });
      const d = (await r.json().catch(() => null)) as { ok: boolean; brief?: Brief; error?: string } | null;
      if (!d?.ok || !d.brief) throw new Error(d?.error ?? `분석 실패 (HTTP ${r.status})`);
      setBrief(d.brief);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
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
          채널팩 조회수·키워드·구글 급상승·기사·TMDB·편성을 모아 Claude 에게 보내는 중입니다. 2~4분 걸립니다.
        </div>
      )}
      {err && (
        <div className="mb-3 rounded-xl border px-4 py-2.5 text-[13px] font-semibold" style={{ color: 'var(--red)' }}>
          {err}
        </div>
      )}

      {!brief ? (
        <Empty>{hasKey === null ? '불러오는 중…' : '아직 브리핑이 없습니다. 「지금 분석」을 누르세요.'}</Empty>
      ) : (
        <BriefBody brief={brief} />
      )}
    </>
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
