"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { LiveIndicator } from "@/components/LiveIndicator";

type Mood = "positive" | "neutral" | "negative";
type InboxItem = {
  account: string; handle: string; commentId: string; text: string; username: string;
  timestamp: string; likeCount: number; mediaId: string; permalink: string; caption: string;
  mood: Mood; isLead: boolean; reason: string;
};
type InboxData = {
  items: InboxItem[];
  dmAvailable: boolean;
  dmReason?: string;
  latencyMs: number;
  error?: string;
};

const MOOD_STYLE: Record<Mood, string> = {
  positive: "bg-green-50 text-green-700 border-green-200",
  neutral: "bg-gray-50 text-gray-600 border-gray-200",
  negative: "bg-red-50 text-red-700 border-red-200",
};
const MOOD_EMOJI: Record<Mood, string> = { positive: "🙂", neutral: "😐", negative: "😠" };

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type Filter = "all" | "leads" | "positive" | "negative";

export default function InboxPage() {
  return (
    <DashboardShell title="Inbox" subtitle="Comments for the selected brand — sentiment-labelled, lead-flagged. Reply, or save the lead to your CRM.">
      {({ accountId }) => <Inner accountId={accountId} />}
    </DashboardShell>
  );
}

function Inner({ accountId }: { accountId: string }) {
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  function load(force = false) {
    setLoading(true);
    const qs = new URLSearchParams({ accountId });
    if (force) qs.set("force", "1");
    fetch(`/api/inbox?${qs}`)
      .then((r) => r.json())
      .then((d: InboxData) => { setData(d); setFetchedAt(Date.now()); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accountId]);

  const items = data?.items ?? [];
  const leadCount = items.filter((i) => i.isLead).length;
  const filtered = items.filter((i) =>
    filter === "all" ? true :
    filter === "leads" ? i.isLead :
    filter === "positive" ? i.mood === "positive" :
    i.mood === "negative",
  );

  return (
    <>
      <div className="flex items-end justify-between mb-4">
        <div className="text-xs text-gray-500">
          {items.length} comments · <b className="text-violet-600">{leadCount} leads</b> detected for this brand.
        </div>
        <LiveIndicator fetchedAt={fetchedAt} latencyMs={data?.latencyMs ?? null} onRefresh={() => load(true)} loading={loading} />
      </div>

      {/* DM status banner */}
      <div className={`rounded-xl border p-3 mb-4 text-sm ${data?.dmAvailable ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
        {data?.dmAvailable
          ? "✅ Direct Messages are available — DM threads can be added here."
          : "ℹ️ Comments (with replies) are live. Direct Messages need 2 more switches — turn on Instagram messaging in the app settings, and toggle “Allow access to messages” inside each Instagram account. The token permission is already done."}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {([["all", `All (${items.length})`], ["leads", `🎯 Leads (${leadCount})`], ["positive", "🙂 Positive"], ["negative", "😠 Negative"]] as [Filter, string][]).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${filter === f ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 && <div className="text-gray-400 text-sm py-10 text-center">Loading comments…</div>}
      {!loading && filtered.length === 0 && <div className="text-gray-400 text-sm py-10 text-center">No comments in this filter.</div>}

      <div className="space-y-3">
        {filtered.map((it) => <CommentCard key={it.commentId} item={it} />)}
      </div>
    </>
  );
}

function CommentCard({ item }: { item: InboxItem }) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true); setStatus(null);
    try {
      const r = await fetch("/api/inbox", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", account: item.account, commentId: item.commentId, message: reply }),
      });
      const j = await r.json();
      if (j.ok) { setStatus("✅ Replied"); setReply(""); }
      else setStatus(`❌ ${j.error || "Failed"} — replying may need Meta approval (instagram_manage_comments).`);
    } catch (e) { setStatus(`❌ ${(e as Error).message}`); }
    finally { setSending(false); }
  }

  async function saveLead() {
    setStatus(null);
    try {
      const r = await fetch("/api/inbox", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_lead", lead: {
          ig_username: item.username, account: item.handle, comment: item.text,
          mood: item.mood, post_url: item.permalink, comment_time: item.timestamp,
        } }),
      });
      const j = await r.json();
      if (j.ok) { setSaved(true); setStatus("✅ Saved to CRM"); }
      else setStatus(`❌ ${j.error || "Save failed"}`);
    } catch (e) { setStatus(`❌ ${(e as Error).message}`); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">@{item.username}</span>
          <span className="text-xs text-gray-400">on {item.handle}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${MOOD_STYLE[item.mood]}`}>{MOOD_EMOJI[item.mood]} {item.mood}</span>
          {item.isLead && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-600 text-white">🎯 LEAD{item.reason ? ` · ${item.reason}` : ""}</span>}
        </div>
        <span className="text-xs text-gray-400 shrink-0">{timeAgo(item.timestamp)} ago</span>
      </div>

      <p className="text-sm text-gray-800 mb-1">{item.text}</p>
      <a href={item.permalink} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-violet-600">
        on post: “{item.caption || "view post"}” ↗
      </a>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={reply} onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendReply(); }}
          placeholder="Write a reply…"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-violet-400"
        />
        <button onClick={sendReply} disabled={sending}
          className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-white disabled:opacity-50">
          {sending ? "…" : "Reply"}
        </button>
        <button onClick={saveLead} disabled={saved}
          className="text-sm px-3 py-1.5 rounded-lg bg-violet-600 text-white disabled:opacity-50">
          {saved ? "✓ Saved" : "Save to CRM"}
        </button>
      </div>
      {status && <div className="text-xs mt-2 text-gray-600">{status}</div>}
    </div>
  );
}
