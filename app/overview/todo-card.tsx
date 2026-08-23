'use client';

import { useEffect, useState } from 'react';
import { kstTodayDate } from '@/lib/kst';

type Todo = {
  id: string;
  content: string;
  due: string | null;
  priority: number;
  completed: boolean;
  url: string | null;
};

/** Todoist 는 4가 가장 높다. 화면에서는 '높음/보통'만 쓴다. */
const HIGH = 4;
const NORMAL = 1;

/** 마감일 표시 — 오늘/내일은 말로, 지난 건 강조 */
function dueLabel(due: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const today = kstTodayDate();
  if (due === today) return { text: '오늘', overdue: false };
  const t = new Date(`${today}T00:00:00Z`).getTime();
  const d = new Date(`${due}T00:00:00Z`).getTime();
  const diff = Math.round((d - t) / 86_400_000);
  if (diff === 1) return { text: '내일', overdue: false };
  return { text: `${due.slice(5, 7)}.${due.slice(8, 10)}`, overdue: diff < 0 };
}

export function TodoCard() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConnected, setNotConnected] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = async () => {
    try {
      const r = await fetch('/api/v1/todoist/todos', { cache: 'no-store' });
      const j = await r.json();
      if (j.success) {
        setTodos(j.data ?? []);
        setNotConnected(false);
        setErr(null);
      } else if (j.error?.code === 'NOT_CONNECTED') {
        setNotConnected(true);
      } else {
        setErr(j.error?.message ?? '불러오기 실패');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/v1/todoist/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, due: draftDue || null }),
      });
      const j = await r.json();
      if (!j.success) {
        setErr(j.error?.message ?? '추가 실패');
        return;
      }
      setDraft('');
      setDraftDue('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/v1/todoist/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({ success: false }));
    if (!j.success) setErr(j.error?.message ?? '수정 실패');
    await load();
  };

  const complete = async (id: string) => {
    // 응답을 기다리면 체크가 굼떠 보인다 — 먼저 지우고 실패하면 되돌린다
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await patch(id, { completed: true });
  };

  const remove = async (id: string) => {
    if (!confirm('이 할 일을 삭제할까요? (완료가 아니라 기록 없이 사라집니다)')) return;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    const r = await fetch(`/api/v1/todoist/todos/${id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({ success: false }));
    if (!j.success) setErr(j.error?.message ?? '삭제 실패');
    await load();
  };

  const commitEdit = async () => {
    const id = editingId;
    if (!id) return;
    const content = editText.trim();
    setEditingId(null);
    const before = todos.find((t) => t.id === id);
    if (!content || content === before?.content) return;
    await patch(id, { content });
  };

  return (
    <section className="card-surface theme-fade flex min-h-[200px] flex-col rounded-[24px]">
      <div className="flex items-center justify-between gap-3 px-[22px] pb-2 pt-[18px]">
        <h2 className="text-[17px] font-extrabold tracking-[-0.03em]">할 일</h2>
        <span className="text-[12.5px] font-semibold text-[color:var(--text-faint)]">
          Todoist 「새로이 할일」
        </span>
      </div>

      {/* 입력 */}
      {!notConnected && (
        <div className="flex gap-1.5 px-[22px] pb-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="할 일 추가"
            className="h-9 min-w-0 flex-1 rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2.5 text-[13.5px]"
          />
          <input
            type="date"
            value={draftDue}
            onChange={(e) => setDraftDue(e.target.value)}
            title="마감일 (선택)"
            className="h-9 w-[132px] shrink-0 rounded-[10px] border border-input bg-[color:var(--surface-input)] px-2 text-[12.5px]"
          />
          <button
            onClick={add}
            disabled={!draft.trim() || busy}
            className="h-9 shrink-0 rounded-[10px] bg-brand px-3.5 text-[13.5px] font-bold text-brand-foreground hover:opacity-90 disabled:opacity-40"
          >
            추가
          </button>
        </div>
      )}

      {err && (
        <p className="px-[22px] pb-1 text-[12.5px] font-semibold text-[color:var(--red)]">{err}</p>
      )}

      {/* 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-4">
        {notConnected ? (
          <p className="py-8 text-center text-[13px] font-semibold text-[color:var(--text-faint)]">
            Todoist 가 연결되어 있지 않습니다. 대시보드에서 토큰을 연결하면 여기에 할 일이 뜹니다.
          </p>
        ) : loading ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">불러오는 중…</p>
        ) : todos.length === 0 ? (
          <p className="py-8 text-center text-[13px] font-semibold text-[color:var(--text-faint)]">
            할 일이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--border-row)]">
            {todos.map((t) => {
              const d = dueLabel(t.due);
              return (
                <li key={t.id} className="group flex items-center gap-2.5 py-2">
                  <button
                    onClick={() => complete(t.id)}
                    title="완료"
                    className="h-[18px] w-[18px] shrink-0 rounded-full border-2 hover:border-[color:var(--accent-solid)]"
                    style={{ borderColor: 'var(--border-dashed)' }}
                  />
                  {editingId === t.id ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitEdit();
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      className="h-8 min-w-0 flex-1 rounded border bg-background px-1.5 text-[13.5px]"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setEditingId(t.id);
                        setEditText(t.content);
                      }}
                      className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold"
                      title={t.content}
                    >
                      {t.content}
                    </button>
                  )}
                  {d && (
                    <span
                      className="num shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold"
                      style={
                        d.overdue
                          ? { background: 'var(--red-bg)', color: 'var(--red)' }
                          : { background: 'var(--chip)', color: 'var(--text-quaternary)' }
                      }
                    >
                      {d.text}
                    </span>
                  )}
                  <button
                    onClick={() => patch(t.id, { priority: t.priority === HIGH ? NORMAL : HIGH })}
                    title={t.priority === HIGH ? '중요 해제' : '중요 표시'}
                    className={
                      'shrink-0 text-[13px] ' +
                      (t.priority === HIGH ? '' : 'hover-action text-[color:var(--text-faint)]')
                    }
                    style={t.priority === HIGH ? { color: 'var(--amber)' } : undefined}
                  >
                    ★
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    title="삭제"
                    className="hover-action shrink-0 text-[13px] text-[color:var(--text-faint)] hover:text-[color:var(--red)]"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
