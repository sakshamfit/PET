/**
 * Team chat — conversation list (unread badges) + message threads with
 * optional student context links. Operational communication only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { petChat, petMe, petStudents, getPetUser, PetApiFailure } from '../../../src/services/petApi';
import type { ChatMessage, Conversation } from '../../../src/types/pet';
import { Badge, Card, EmptyState, Spinner } from '../ui';

export function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setConversations((await petChat.conversations()).conversations); } catch { /* stale */ }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => { if (!openId) void load(); }, 20_000);
    return () => clearInterval(t);
  }, [load, openId]);

  if (openId) {
    return <ThreadView id={openId} onBack={async () => { setOpenId(null); await load(); }} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Team chat</h3>
        <button className="p-btn-primary !min-h-9 !px-3 text-xs" onClick={() => setShowNew(true)}>+ New</button>
      </div>
      {loading ? <Spinner /> : conversations.length === 0 ? (
        <Card><EmptyState title="No conversations" hint="Start a chat with a team member." /></Card>
      ) : (
        <div className="space-y-2">
          {conversations.map(c => {
            const me = getPetUser();
            const others = (c.members ?? []).filter(m => m.user_id !== me?.id);
            const title = c.type === 'group' ? c.title ?? 'Group' : others.map(m => m.name).join(', ') || 'Chat';
            return (
              <button key={c.id} className="p-card w-full p-3.5 text-left" onClick={() => setOpenId(c.id)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{title}</p>
                    <p className="truncate text-xs text-slate-500">{c.last_message || 'No messages yet'}</p>
                  </div>
                  {(c.unread_count ?? 0) > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-pet-700 px-1.5 text-[10px] font-bold text-white">
                      {c.unread_count}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {showNew ? <NewChatSheet onClose={() => setShowNew(false)} onOpen={id => { setShowNew(false); setOpenId(id); }} /> : null}
    </div>
  );
}

function NewChatSheet({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [members, setMembers] = useState<Array<{ id: string; name: string; role: string; department: string | null }>>([]);
  useEffect(() => { void petMe.directory().then(r => setMembers(r.members)).catch(() => {}); }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4" onClick={onClose}>
      <div className="mx-auto mt-16 w-full max-w-sm rounded-3xl bg-white p-4" onClick={e => e.stopPropagation()}>
        <h3 className="mb-2 text-sm font-bold">Start chat with</h3>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {members.map(m => (
            <button key={m.id} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              onClick={async () => {
                try { const r = await petChat.openDirect(m.id); onOpen(r.conversation.id); }
                catch { onClose(); }
              }}>
              <span className="font-semibold">{m.name}</span>
              <span className="block text-xs text-slate-500">
                {m.role === 'main_admin' ? 'Main Admin' : m.department || 'Employee'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const me = getPetUser();

  const load = useCallback(async () => {
    try { setMessages((await petChat.messages(id)).messages); } catch { /* keep */ }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      await petChat.send(id, { text: trimmed });
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof PetApiFailure ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] flex-col">
      <button className="mb-2 self-start text-sm font-semibold text-pet-700" onClick={onBack}>← Chats</button>
      <div className="flex-1 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3">
        {messages.length === 0 ? <EmptyState title="No messages yet" hint="Say hello." /> : null}
        {messages.map(m => {
          const mine = m.sender_id === me?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? 'bg-pet-800 text-white' : 'bg-white text-slate-800'}`}>
                {!mine ? <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide opacity-60">{m.sender_name}</p> : null}
                <p className="whitespace-pre-line">{m.text}</p>
                <div className={`mt-1 flex items-center gap-2 text-[10px] ${mine ? 'text-pet-100/70' : 'text-slate-400'}`}>
                  <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {m.linked_student_id ? <LinkedStudentChip id={m.linked_student_id} mine={mine} /> : null}
                  {m.linked_task_id ? <Badge tone="purple">task</Badge> : null}
                  {m.linked_school_id ? <Badge tone="green">school</Badge> : null}
                  {m.linked_visit_id ? <Badge tone="blue">visit</Badge> : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
      <form className="mt-2 flex gap-2" onSubmit={send}>
        <input className="p-input flex-1" placeholder="Message…" value={text} onChange={e => setText(e.target.value)} />
        <button className="p-btn-primary shrink-0" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  );
}

function LinkedStudentChip({ id, mine }: { id: string; mine: boolean }) {
  const [label, setLabel] = useState('student');
  useEffect(() => {
    void petStudents.get(id).then(r => setLabel(r.student.name)).catch(() => {});
  }, [id]);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mine ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-800'}`}>
      🎓 {label}
    </span>
  );
}
