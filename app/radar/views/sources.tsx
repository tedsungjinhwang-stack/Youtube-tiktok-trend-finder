'use client';

/**
 * 원본 채널 레이더 — 짜깁기 채널이 어느 원본(스케치 원본 채널 · 유튜브 예능)을 잘라 올리고, 어느 원본이 지금 뜨는지.
 * 한국어 채널의 클립만 센다. 6시간마다 미리 계산 (lib/radar/sources.ts).
 */

import { useEffect, useState } from 'react';
import { sourcesAction } from '../actions';
import type { SourceBoard, SourceKind } from '@/lib/radar/sources';
import { Chip, ago, short } from './parts';

const TITLE: Record<SourceKind, { title: string; sub: string }> = {
  sketch: { title: '뜨는 원본 채널', sub: '스케치코미디 짜깁기 채널(한국어)이 최근 3일 어느 원본을 잘라 올렸나 — 24시간 조회 증가 순' },
  yt_variety: {
    title: '뜨는 유튜브 예능',
    sub: 'TMDB 에 없는 웹예능 — 예능 짜깁기 채널(한국어)이 최근 3일 올린 클립 기준, 24시간 조회 증가 순',
  },
};

export function SourceBoardView({ kind }: { kind: SourceKind }) {
  const [data, setData] = useState<SourceBoard | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    sourcesAction(kind)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [kind]);
  const t = TITLE[kind];
  const rows = data?.rows ?? [];
  return (
    <section className="card-surface theme-fade mb-3 rounded-[22px] px-[22px] py-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">{t.title}</h2>
          <p className="text-[12.5px] font-semibold text-muted-foreground">{t.sub}</p>
        </div>
        {data?.at && <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">{ago(data.at)} 계산 · 6시간마다</span>}
      </div>
      {data === undefined ? (
        <p className="py-4 text-[13px] font-semibold text-muted-foreground">불러오는 중…</p>
      ) : !rows.length ? (
        <p className="py-4 text-[13px] font-semibold text-muted-foreground">아직 계산 전입니다 — 6시간마다(1·7·13·19시 10분 UTC) 채워집니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] font-bold text-[color:var(--text-faint)]">
                <th className="py-1.5 pr-2">원본</th>
                <th className="px-2 text-right">3일 클립</th>
                <th className="px-2 text-right">채널</th>
                <th className="px-2 text-right">클립 조회</th>
                <th className="px-2 text-right">24시간 증가</th>
                <th className="px-2 text-right">그 전 4일</th>
                <th className="pl-2">가장 잘 나온 클립</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((r) => {
                // 클립 수가 그 전 4일(하루 평균)보다 늘었나 — 3일 vs 4일이라 하루 평균으로 비교
                const up = r.clipsPrev ? r.clips3d / 3 / (r.clipsPrev / 4) : null;
                const fewCh = r.channels3d <= 2 && r.views3d >= 300_000;
                return (
                  <tr key={r.name} className="border-t" style={{ borderColor: 'var(--chip)' }}>
                    <td className="py-1.5 pr-2 font-bold">
                      {r.name} {fewCh && <Chip tone="green" title="조회는 30만+인데 짜깁기 채널이 2곳 이하 — 들어갈 자리">꿀통</Chip>}
                    </td>
                    <td className="num px-2 text-right">{r.clips3d}</td>
                    <td className="num px-2 text-right">{r.channels3d}</td>
                    <td className="num px-2 text-right">{short(r.views3d)}</td>
                    <td className="num px-2 text-right font-bold">{short(r.gain24h)}</td>
                    <td className="num px-2 text-right">
                      {r.clipsPrev}
                      {up != null && up >= 1.5 && <span style={{ color: 'var(--green)' }}> ▲</span>}
                      {up != null && up <= 0.6 && <span style={{ color: 'var(--red)' }}> ▼</span>}
                      {up == null && r.clips3d > 0 && <span style={{ color: 'var(--green)' }}> 새로</span>}
                    </td>
                    <td className="max-w-[320px] truncate pl-2 text-muted-foreground">
                      {r.top ? (
                        <a href={`https://www.youtube.com/shorts/${r.top.id}`} target="_blank" rel="noreferrer" className="hover:text-foreground" title={r.top.title}>
                          {r.top.title} · {short(r.top.views)}회
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
