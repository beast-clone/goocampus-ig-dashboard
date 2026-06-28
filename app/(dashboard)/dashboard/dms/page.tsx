"use client";
import { useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";

type Mode = "ai" | "human";
type Direction = "in" | "out";
type Thread = {
  account: string;
  sender_id: string;
  username?: string;
  mode: Mode;
  last_message_at: string;
  last_message_text: string;
  last_direction: Direction;
  unread_count: number;
};
type Message = {
  id: string;
  account: string;
  sender_id: string;
  direction: Direction;
  text: string;
  source: "user" | "ai" | "human";
  at: string;
};
type ThreadDetail = { thread: Thread | null; messages: Message[]; queued: { reply: string; queued_at: string } | null };

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function DMsPage() {
  return (
    <DashboardShell title="DMs" subtitle="Live Instagram DMs from your followers. AI handles by default — click Takeover to reply as a human.">
      {({ accountId }) => <Inner accountId={accountId} />}
    </DashboardShell>
  );
}

function Inner({ accountId }: { accountId: string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [counts, setCounts] = useState<{ total: number; unread: number; human_mode: number }>({ total: 0, unread: 0, human_mode: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  function loadThreads() {
    fetch(`/api/dm/threads?account=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d) => {
        setThreads(d.threads || []);
        setCounts(d.counts || { total: 0, unread: 0, human_mode: 0 });
        setFetchedAt(Date.now());
        setLoading(false);
        // Auto-select the most recent thread if none selected
        if (!selectedId && d.threads?.[0]) setSelectedId(d.threads[0].sender_id);
      })
      .catch(() => setLoading(false));
  }

  function loadDetail(senderId: string) {
    fetch(`/api/dm/thread/${encodeURIComponent(senderId)}?account=${encodeURIComponent(accountId)}`)
      .then((r) => r.json())
      .then((d: ThreadDetail) => setDetail(d))
      .catch(() => {});
  }

  // Poll threads every 8s for near-real-time feel
  useEffect(() => {
    loadThreads();
    const id = setInterval(loadThreads, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Reload detail when selection changes (and every 8s while open)
  useEffect(() => {
    if (!selectedId) return;
    loadDetail(selectedId);
    const id = setInterval(() => loadDetail(selectedId), 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, accountId]);

  async function toggleTakeover() {
    if (!detail?.thread) return;
    const next: Mode = detail.thread.mode === "ai" ? "human" : "ai";
    await fetch("/api/dm/takeover", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: accountId, sender_id: detail.thread.sender_id, mode: next }),
    });
    loadDetail(detail.thread.sender_id);
    loadThreads();
  }

  return (
    <>
      <div className="flex items-end justify-between mb-3">
        <div className="text-xs text-gray-500">
          {counts.total} threads · <b className="text-violet-600">{counts.unread} unread</b> · {counts.human_mode} in human mode
        </div>
        <LiveIndicator fetchedAt={fetchedAt} latencyMs={null} loading={loading} onRefresh={loadThreads} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-220px)]">
        {/* Left: thread list */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-y-auto">
          {threads.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">
              No DMs yet. Once n8n is wired to mirror, conversations appear here.
            </div>
          )}
          {threads.map((t) => (
            <button
              key={t.sender_id}
              onClick={() => setSelectedId(t.sender_id)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 ${selectedId === t.sender_id ? "bg-violet-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <div className="font-medium text-sm flex-1 truncate">@{t.username || t.sender_id.slice(0, 10)}</div>
                <div className="text-[10px] text-gray-400 shrink-0">{timeAgo(t.last_message_at)}</div>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {t.mode === "human" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">🧑 HUMAN</span>}
                {t.mode === "ai" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">🤖 AI</span>}
                {t.unread_count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-600 text-white font-medium">{t.unread_count}</span>}
              </div>
              <div className="text-xs text-gray-500 mt-1 truncate">
                {t.last_direction === "out" ? "↗ " : "↙ "}{t.last_message_text}
              </div>
            </button>
          ))}
        </div>

        {/* Right: conversation */}
        <div className="bg-white rounded-xl border border-gray-100 flex flex-col">
          {!detail?.thread ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              Select a thread on the left.
            </div>
          ) : (
            <>
              <ConversationHeader thread={detail.thread} onTakeover={toggleTakeover} />
              <ConversationBody messages={detail.messages} />
              <ConversationFooter
                accountId={accountId}
                thread={detail.thread}
                queued={detail.queued}
                onSent={() => loadDetail(detail.thread!.sender_id)}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ConversationHeader({ thread, onTakeover }: { thread: Thread; onTakeover: () => void }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold text-sm">@{thread.username || thread.sender_id}</div>
        <div className="text-xs text-gray-400">on {thread.account} · last activity {timeAgo(thread.last_message_at)} ago</div>
      </div>
      <button
        onClick={onTakeover}
        className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition ${
          thread.mode === "human"
            ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
            : "bg-white text-gray-700 border-gray-300 hover:border-violet-500 hover:text-violet-700"
        }`}
      >
        {thread.mode === "human" ? "🧑 Human mode · click to hand to AI" : "🤖 AI mode · click to take over"}
      </button>
    </div>
  );
}

function ConversationBody({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/50">
      {messages.length === 0 && <div className="text-sm text-gray-400 text-center py-8">No messages yet.</div>}
      {messages.map((m) => <Bubble key={m.id} m={m} />)}
      <div ref={bottomRef} />
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const isOut = m.direction === "out";
  const sourceTag = m.source === "ai" ? "AI" : m.source === "human" ? "YOU" : "";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isOut ? "bg-violet-600 text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-900 rounded-bl-sm"}`}>
        {isOut && sourceTag && (
          <div className={`text-[10px] uppercase font-semibold mb-0.5 ${m.source === "human" ? "text-emerald-200" : "text-violet-200"}`}>{sourceTag}</div>
        )}
        <div className="text-sm whitespace-pre-wrap leading-snug">{m.text}</div>
        <div className={`text-[10px] mt-1 ${isOut ? "text-violet-200" : "text-gray-400"}`}>{timeOfDay(m.at)}</div>
      </div>
    </div>
  );
}

function ConversationFooter({ accountId, thread, queued, onSent }: { accountId: string; thread: Thread; queued: { reply: string; queued_at: string } | null; onSent: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function queue() {
    if (!text.trim()) return;
    setSending(true); setStatus(null);
    try {
      const r = await fetch("/api/dm/reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: accountId, sender_id: thread.sender_id, text }),
      });
      const j = await r.json();
      if (j.ok) { setText(""); setStatus("✅ Queued. Will deliver on user's next message."); onSent(); }
      else setStatus(`❌ ${j.error || "Failed"}`);
    } catch (e) { setStatus(`❌ ${(e as Error).message}`); }
    finally { setSending(false); }
  }

  return (
    <div className="border-t border-gray-100 p-3 space-y-2">
      {queued && (
        <div className="text-xs px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2">
          <span>⏳</span>
          <div className="flex-1">
            <b>Your reply is queued</b> — will deliver when the user messages next.
            <div className="text-amber-700 mt-0.5 italic">&ldquo;{queued.reply}&rdquo;</div>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); queue(); } }}
          placeholder={thread.mode === "human" ? "Type a reply — sends on user's next message…" : "AI is replying. Take over to type a reply."}
          rows={2}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 resize-none"
        />
        <button
          onClick={queue}
          disabled={sending || !text.trim()}
          className="text-sm px-4 rounded-lg bg-violet-600 text-white font-medium disabled:opacity-40 hover:bg-violet-700"
        >
          {sending ? "…" : "Queue"}
        </button>
      </div>
      {status && <div className="text-xs text-gray-600">{status}</div>}
    </div>
  );
}
