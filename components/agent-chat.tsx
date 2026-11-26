'use client';

/**
 * 오른쪽 아래 AI 채팅 — 대시보드 데이터로 묻고 답한다 (서버: app/api/agent/chat, lib/agent/chat).
 * 대화는 이 브라우저에만 남는다 (localStorage). 로그인 화면에서는 안 보인다.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Msg = { role: 'user' | 'assistant'; content: string; costKrw?: number; ms?: number; steps?: number; error?: boolean };
const STORE = 'agent-chat:v1';
const EXAMPLES = ['오늘 하루 조회가 가장 많이 오른 채널팩 5개는?', '지금 터진 한국어 쇼츠 상위 10개 보여줘', '수창 전 채널 목록이랑 애드센스 계정 정리해줘'];

export function AgentChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? '[]');
      if (Array.isArray(saved)) setMsgs(saved);
    } catch {
      /* 저장본이 없거나 깨졌으면 새로 */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* 저장 못 해도 대화는 된다 */
    }
  }, [msgs]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, steps, open]);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  if (pathname === '/login') return null;

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    setSteps([]);
    setElapsed(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let answer = '';
    let meta: Pick<Msg, 'costKrw' | 'ms' | 'steps'> = {};
    let error: string | null = null;
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 앞선 오류 답은 빼고 보낸다
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), page: pathname }),
        signal: ctrl.signal,
      });
      // 로그인이 풀리면 미들웨어가 로그인 화면(HTML)으로 돌려보낸다
      if (res.redirected || !(res.headers.get('content-type') ?? '').includes('ndjson')) {
        throw new Error(res.ok || res.redirected ? '로그인이 풀렸습니다 — 새로고침해서 다시 로그인해 주세요' : `요청 실패 (HTTP ${res.status})`);
      }
      if (!res.body) throw new Error(`요청 실패 (HTTP ${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line) as { type: string; text?: string; message?: string; costKrw?: number; ms?: number; steps?: number };
          if (e.type === 'step' && e.text) setSteps((s) => [...s, e.text!]);
          else if (e.type === 'answer') answer = e.text ?? '';
          else if (e.type === 'done') meta = { costKrw: e.costKrw, ms: e.ms, steps: e.steps };
          else if (e.type === 'error') error = e.message ?? '알 수 없는 오류';
        }
      }
      if (!answer && !error) error = '답을 받지 못했습니다 (연결이 끊겼을 수 있습니다) — 다시 물어 주세요';
    } catch (e) {
      error = (e as Error).name === 'AbortError' ? '멈췄습니다' : (e as Error).message;
    } finally {
      abortRef.current = null;
      setBusy(false);
      setSteps([]);
      setMsgs((m) => [...m, error ? { role: 'assistant', content: error, error: true } : { role: 'assistant', content: answer, ...meta }]);
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-12 items-center gap-1.5 rounded-full bg-brand px-4 text-[14px] font-extrabold text-brand-foreground shadow-lg"
          title="대시보드 데이터로 물어보기 (Claude Opus 5.5)"
        >
          AI {busy && <span className="h-2 w-2 animate-pulse rounded-full bg-current" />}
        </button>
      )}
      {open && (
        <div className="card-surface fixed bottom-4 right-4 z-50 flex h-[min(640px,calc(100vh-5rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] border shadow-2xl" style={{ borderColor: 'var(--chip)' }}>
          <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: 'var(--chip)' }}>
            <span className="text-[14.5px] font-extrabold">대시보드 AI</span>
            <span className="text-[11.5px] font-semibold text-[color:var(--text-faint)]">Opus 5.5 · 읽기 전용</span>
            <span className="flex-1" />
            {msgs.length > 0 && !busy && (
              <button onClick={() => setMsgs([])} className="text-[12px] font-bold text-muted-foreground hover:text-foreground">
                새 대화
              </button>
            )}
            <button onClick={() => setOpen(false)} className="px-1 text-[18px] font-bold text-muted-foreground hover:text-foreground" aria-label="닫기">
              ×
            </button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <div className="space-y-2 text-[13px] text-muted-foreground">
                <p className="font-semibold">감시 채널 · 영상 · 작품 · 내 채널 · 미리 계산한 집계를 직접 조회해서 답합니다. 예를 들면:</p>
                {EXAMPLES.map((q) => (
                  <button key={q} onClick={() => ask(q)} className="block w-full rounded-xl px-3 py-2 text-left font-semibold hover:text-foreground" style={{ background: 'var(--chip)' }}>
                    {q}
                  </button>
                ))}
                <p className="text-[11.5px]">API 키·토큰 표는 못 읽습니다. 질문마다 Claude 비용이 듭니다 (보통 100~500원).</p>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-10 whitespace-pre-wrap rounded-2xl bg-brand px-3 py-2 text-[13.5px] font-semibold text-brand-foreground">
                  {m.content}
                </div>
              ) : (
                <div key={i} className={'text-[13.5px] leading-relaxed ' + (m.error ? 'font-semibold text-[color:var(--red)]' : '')}>
                  {m.error ? m.content : <Markdown text={m.content} />}
                  {m.costKrw != null && (
                    <div className="mt-1 text-[11px] font-semibold text-[color:var(--text-faint)]">
                      조회 {m.steps ?? 0}번 · {Math.round((m.ms ?? 0) / 1000)}초 · 약 {m.costKrw.toLocaleString()}원
                    </div>
                  )}
                </div>
              )
            )}
            {busy && (
              <div className="space-y-1 text-[12.5px] font-semibold text-muted-foreground">
                {steps.map((s, i) => (
                  <div key={i}>· {s}</div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
                  {steps.length ? '계속 보는 중' : '생각하는 중'} · {elapsed}초
                  <button onClick={() => abortRef.current?.abort()} className="ml-auto text-[12px] font-bold hover:text-foreground">
                    멈추기
                  </button>
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-end gap-2 border-t px-3 py-2.5"
            style={{ borderColor: 'var(--chip)' }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              rows={2}
              placeholder="대시보드 데이터로 물어보기 (Enter 보내기 · Shift+Enter 줄바꿈)"
              className="min-h-[44px] flex-1 resize-none rounded-xl bg-transparent px-3 py-2 text-[13.5px] outline-none"
              style={{ background: 'var(--chip)' }}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} className="h-10 rounded-xl bg-brand px-4 text-[13px] font-bold text-brand-foreground disabled:opacity-50">
              보내기
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/* ───────────── 작은 마크다운 (제목 · 목록 · 표 · 굵게 · 코드 · 링크) ───────────── */

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded px-1 text-[12.5px]" style={{ background: 'var(--chip)' }}>{p.slice(1, -1)}</code>;
        const md = p.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        if (md) return <a key={i} href={md[2]} target="_blank" rel="noreferrer" className="text-brand underline">{md[1]}</a>;
        if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-brand underline">{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      i--;
      out.push(
        <div key={i} className="my-1.5 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className={ri === 0 ? 'font-bold' : 'border-t'} style={{ borderColor: 'var(--chip)' }}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-1.5 py-1 align-top">
                      <Inline text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      out.push(<div key={i} className="mt-2 font-extrabold"><Inline text={h[1]} /></div>);
      continue;
    }
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      out.push(
        <div key={i} className="flex gap-1.5" style={{ paddingLeft: Math.min(li[1].length, 6) * 6 }}>
          <span className="shrink-0 text-muted-foreground">{/^\d/.test(li[2]) ? li[2] : '·'}</span>
          <span><Inline text={li[3]} /></span>
        </div>
      );
      continue;
    }
    out.push(line.trim() ? <p key={i}><Inline text={line} /></p> : <div key={i} className="h-1.5" />);
  }
  return <div className="space-y-0.5">{out}</div>;
}
