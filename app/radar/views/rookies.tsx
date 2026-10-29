'use client';

import { useEffect, useState, useTransition } from 'react';
import { Pill } from '../../trends/ui';
import type { CandidateList, CandidateRow, RookieRow } from '@/lib/radar/discover';
import {
  acceptAllSuggestedAction,
  acceptCandidateAction,
  addCandidatesAction,
  candidatesAction,
  rejectCandidateAction,
  restoreCandidateAction,
  rookiesInPacksAction,
} from '../actions';
import { Chip, Empty, FORMAT_LABEL, VideoThumb, ago, channelAge, short } from './parts';

/**
 * 신규 발굴 — 아직 채널팩에 없는 '대박 신생' 채널.
 * 수집기가 2시간마다 유튜브 검색·인기 급상승·추천 채널에서 찾아, 기준을 넘은 것만 팩 추천과 함께 올린다.
 * 「넣기」를 누르면 그 팩 채널이 되고 다음 수집부터 매시간 잰다.
 */

type Tab = 'new' | 'added' | 'rejected' | 'packs';

/** 추천 1순위가 이 점수 이상이면 「추천대로 모두 넣기」 대상 */
const AUTO_MIN = 0.3;

export function RookiesView() {
  const [tab, setTab] = useState<Tab>('new');
  const [data, setData] = useState<CandidateList | null>(null);
  const [packs, setPacks] = useState<RookieRow[] | null>(null);
  const [reload, setReload] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [links, setLinks] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    start(async () => {
      try {
        if (tab === 'packs') {
          const r = await rookiesInPacksAction();
          if (alive) setPacks(r);
        } else {
          const r = await candidatesAction(tab);
          if (alive) setData(r);
        }
        if (alive) setErr(null);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    });
    return () => {
      alive = false;
    };
  }, [tab, reload]);

  const refresh = () => setReload((n) => n + 1);
  const autoCount = (data?.rows ?? []).filter((r) => r.status === 'new' && r.qualified && (r.suggestions[0]?.score ?? 0) >= AUTO_MIN).length;

  const addLinks = async () => {
    if (!links.trim()) return;
    setMsg('채널 정보를 받는 중…');
    try {
      const r = await addCandidatesAction(links);
      const parts = [`${r.added}개 후보로 올림`];
      if (r.existing.length) parts.push(`이미 있음 ${r.existing.map((e) => `${e.name}(${e.folder})`).join(', ')}`);
      if (r.failed.length) parts.push(`못 찾음 ${r.failed.join(', ')}`);
      setMsg(parts.join(' · '));
      setLinks('');
      setTab('new');
      refresh();
    } catch (e) {
      setMsg('추가하지 못했습니다 — ' + (e as Error).message);
    }
  };

  return (
    <>
      <div className="mb-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.04em]">신규 발굴</h1>
        <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
          아직 채널팩에 없는 대박 신생 채널 — 개설 1년 이내 · 영상 400개 이하 · 영상당 평균 100만 회+ · 30일 안에 업로드. 2시간마다 유튜브 검색·인기
          급상승·추천 채널에서 찾습니다.
        </p>
      </div>

      <div className="card-surface theme-fade mb-3 space-y-2.5 rounded-[22px] px-[22px] py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill strong active={tab === 'new'} onClick={() => setTab('new')}>
            새로 찾음 {data && <span className="num ml-0.5 opacity-70">{data.counts.new}</span>}
          </Pill>
          <Pill strong active={tab === 'added'} onClick={() => setTab('added')}>
            넣음 {data && <span className="num ml-0.5 opacity-70">{data.counts.added}</span>}
          </Pill>
          <Pill strong active={tab === 'rejected'} onClick={() => setTab('rejected')}>
            제외 {data && <span className="num ml-0.5 opacity-70">{data.counts.rejected}</span>}
          </Pill>
          <span className="mx-1 h-4 w-px" style={{ background: 'var(--chip)' }} />
          <Pill strong active={tab === 'packs'} onClick={() => setTab('packs')}>
            팩 안의 대박 신생
          </Pill>
          {tab === 'new' && autoCount > 0 && (
            <button
              onClick={async () => {
                if (!confirm(`추천 1순위 점수 ${Math.round(AUTO_MIN * 100)}점 이상 ${autoCount}곳을 추천 팩에 넣을까요?`)) return;
                const n = await acceptAllSuggestedAction(AUTO_MIN);
                setMsg(`${n}곳을 추천 팩에 넣었습니다`);
                refresh();
              }}
              className="ml-auto h-8 rounded-[10px] bg-brand px-3 text-[12.5px] font-bold text-brand-foreground"
            >
              추천대로 모두 넣기 ({autoCount})
            </button>
          )}
        </div>
        <form
          className="flex flex-wrap gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            addLinks();
          }}
        >
          <textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={1}
            placeholder="채널 링크 · @핸들 · UC로 시작하는 ID — 여러 개는 줄바꿈 (기준 밖이어도 후보로 올림)"
            className="min-h-[36px] min-w-0 flex-1 resize-y rounded-xl border-0 px-3 py-2 text-[13px] outline-none"
            style={{ background: 'var(--chip)' }}
          />
          <button className="h-9 rounded-xl bg-brand px-4 text-[13px] font-bold text-brand-foreground" disabled={!links.trim()}>
            후보로 올리기
          </button>
        </form>
        {msg && <p className="text-[12.5px] font-semibold text-muted-foreground">{msg}</p>}
      </div>

      {err ? (
        <Empty>불러오지 못했습니다 — {err}</Empty>
      ) : tab === 'packs' ? (
        !packs ? (
          <Empty>불러오는 중…</Empty>
        ) : packs.length === 0 ? (
          <Empty>팩 안에 기준을 넘는 채널이 아직 없습니다.</Empty>
        ) : (
          <PackRookies rows={packs} />
        )
      ) : !data ? (
        <Empty>불러오는 중…</Empty>
      ) : data.rows.length === 0 ? (
        <Empty>
          {tab === 'new'
            ? '아직 새로 찾은 채널이 없습니다. 수집기가 2시간마다 찾아 올립니다.'
            : tab === 'added'
              ? '아직 팩에 넣은 채널이 없습니다.'
              : '제외한 채널이 없습니다.'}
        </Empty>
      ) : (
        <div className={'space-y-2.5' + (pending ? ' opacity-60' : '')}>
          {data.rows.map((r) => (
            <CandidateCard key={r.externalId} r={r} folders={data.folders} onDone={refresh} />
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[color:var(--text-faint)]">{label}</span>
      <strong className="num font-bold text-foreground">{children}</strong>
    </span>
  );
}

function CandidateCard({ r, folders, onDone }: { r: CandidateRow; folders: { id: string; name: string }[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [other, setOther] = useState('');
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const folderName = folders.find((f) => f.id === r.folderId)?.name;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const put = (target: { folderId?: string; newFolder?: string }) => act(() => acceptCandidateAction(r.externalId, target));

  return (
    <div className="card-surface theme-fade rounded-[18px] p-4">
      <div className="flex flex-wrap items-start gap-3">
        <a href={`https://www.youtube.com/channel/${r.externalId}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
          {r.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 채널 썸네일
            <img src={r.thumbnailUrl} alt="" className="h-12 w-12 rounded-full" loading="lazy" />
          ) : (
            <span className="block h-12 w-12 rounded-full" style={{ background: 'var(--chip)' }} />
          )}
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href={`https://www.youtube.com/channel/${r.externalId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-[15px] font-extrabold hover:underline"
            >
              {r.title ?? r.externalId}
            </a>
            {r.contentFormat && <Chip>{FORMAT_LABEL[r.contentFormat] ?? r.contentFormat}</Chip>}
            {r.qualified ? <Chip tone="green">대박 신생</Chip> : r.checked ? <Chip tone="amber">기준 밖</Chip> : <Chip>확인 중</Chip>}
            <Chip title="어디서 찾았나">{r.source}</Chip>
          </div>
          {r.checked ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-semibold">
              <Stat label="평균">{r.avgViews != null ? short(r.avgViews) : '—'}</Stat>
              <Stat label="누적">{r.viewCount != null ? short(r.viewCount) : '—'}</Stat>
              <Stat label="영상">{r.videoCount ?? '—'}개</Stat>
              <Stat label="구독자">{r.subscriberCount != null ? short(r.subscriberCount) : '비공개'}</Stat>
              <Stat label="개설">{channelAge(r.channelCreatedAt) ?? '—'}</Stat>
              <Stat label="최근 업로드">{r.lastUploadAt ? ago(r.lastUploadAt) : '—'}</Stat>
              <span className="text-[color:var(--text-faint)]">찾은 때 {ago(r.foundAt)}</span>
            </div>
          ) : (
            <p className="mt-1.5 text-[12px] font-semibold text-muted-foreground">다음 수집 때 채널 통계와 최근 영상을 받아 팩을 추천합니다.</p>
          )}
        </div>
      </div>

      {r.sampleVideos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {r.sampleVideos.slice(0, 6).map((v) => (
            <a
              key={v.id}
              href={v.isShorts ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-[96px] shrink-0"
              title={v.title}
            >
              <VideoThumb id={v.id} src={v.thumbnailUrl} vertical={v.isShorts} size="sm" className="w-full rounded-lg">
                <span className="num absolute bottom-1 left-1 rounded bg-black/65 px-1 text-[11px] font-bold text-white">{short(v.views)}</span>
              </VideoThumb>
              <span className="mt-1 line-clamp-2 text-[11.5px] font-semibold leading-snug">{v.title}</span>
            </a>
          ))}
        </div>
      )}

      {r.status === 'new' ? (
        <div className="mt-3 space-y-2">
          {r.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {r.suggestions.map((s, i) => (
                <button
                  key={s.folderId}
                  disabled={busy}
                  onClick={() => put({ folderId: s.folderId })}
                  title={s.reasons.join('\n')}
                  className={
                    'h-8 rounded-[10px] px-3 text-[12.5px] font-bold disabled:opacity-50 ' +
                    (i === 0 ? 'bg-brand text-brand-foreground' : 'text-foreground hover:opacity-80')
                  }
                  style={i === 0 ? undefined : { background: 'var(--chip)' }}
                >
                  {s.name}에 넣기 <span className="num opacity-75">{Math.round(s.score * 100)}</span>
                </button>
              ))}
            </div>
          )}
          {r.suggestions[0]?.reasons.length ? (
            <p className="text-[11.5px] font-semibold text-muted-foreground">추천 근거 — {r.suggestions[0].reasons.join(' · ')}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={() => setOpen(!open)} className="h-8 rounded-[10px] px-3 text-[12.5px] font-bold" style={{ background: 'var(--chip)' }}>
              다른 팩 / 새 팩
            </button>
            <button
              disabled={busy}
              onClick={() => act(() => rejectCandidateAction(r.externalId))}
              className="h-8 rounded-[10px] px-3 text-[12.5px] font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
              style={{ background: 'var(--chip)' }}
            >
              제외
            </button>
          </div>
          {open && (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={other}
                onChange={(e) => setOther(e.target.value)}
                className="h-8 rounded-[10px] border-0 px-2 text-[12.5px] font-semibold outline-none"
                style={{ background: 'var(--chip)' }}
              >
                <option value="">팩 고르기…</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !other}
                onClick={() => put({ folderId: other })}
                className="h-8 rounded-[10px] bg-brand px-3 text-[12.5px] font-bold text-brand-foreground disabled:opacity-50"
              >
                넣기
              </button>
              <span className="mx-1 text-[12px] text-[color:var(--text-faint)]">또는</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="새 팩 이름"
                className="h-8 w-[150px] rounded-[10px] border-0 px-2 text-[12.5px] outline-none"
                style={{ background: 'var(--chip)' }}
              />
              <button
                disabled={busy || !newName.trim()}
                onClick={() => put({ newFolder: newName })}
                className="h-8 rounded-[10px] bg-brand px-3 text-[12.5px] font-bold text-brand-foreground disabled:opacity-50"
              >
                새 팩 만들고 넣기
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
          {r.status === 'added' ? <span>「{folderName ?? '팩'}」에 넣음</span> : <span>제외함</span>}
          {r.status === 'rejected' && (
            <button
              disabled={busy}
              onClick={() => act(() => restoreCandidateAction(r.externalId))}
              className="h-7 rounded-lg px-2.5 text-[12px] font-bold text-foreground"
              style={{ background: 'var(--chip)' }}
            >
              다시 후보로
            </button>
          )}
        </div>
      )}
      {err && <p className="mt-2 text-[12px] font-semibold" style={{ color: 'var(--red)' }}>{err}</p>}
    </div>
  );
}

function PackRookies({ rows }: { rows: RookieRow[] }) {
  return (
    <div className="card-surface theme-fade overflow-hidden rounded-[22px]">
      <div className="px-5 pt-4 text-[12.5px] font-semibold text-muted-foreground">
        이미 팩에 있는 채널 중 대박 신생 기준을 넘는 곳 — 하루 조회수 순 ({rows.length}곳)
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--chip)' }}>
        {rows.map((r) => (
          <a
            key={r.externalId}
            href={`https://www.youtube.com/channel/${r.externalId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--chip)]"
          >
            {r.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 채널 썸네일
              <img src={r.thumbnailUrl} alt="" className="h-8 w-8 shrink-0 rounded-full" loading="lazy" />
            ) : (
              <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: 'var(--chip)' }} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-[13.5px] font-bold">{r.name ?? r.externalId}</span>
                {r.contentFormat && <Chip>{FORMAT_LABEL[r.contentFormat] ?? r.contentFormat}</Chip>}
                <Chip>{r.folder}</Chip>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] font-semibold">
                <Stat label="평균">{short(r.avgViews)}</Stat>
                <Stat label="하루">{r.dailyViews != null ? '+' + short(r.dailyViews) : '—'}</Stat>
                <Stat label="영상">{r.videoCount ?? '—'}개</Stat>
                <Stat label="구독자">{r.subscriberCount != null ? short(r.subscriberCount) : '비공개'}</Stat>
                <Stat label="개설">{channelAge(r.channelCreatedAt) ?? '—'}</Stat>
                <Stat label="최근 업로드">{r.lastUploadAt ? ago(r.lastUploadAt) : '—'}</Stat>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
