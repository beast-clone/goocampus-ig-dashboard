// DM conversation storage — reuses `discover_cache` table so no SQL setup needed.
// Cache keys:
//   dm_thread:{account}:{senderId}   → DMThread (status + last activity)
//   dm_msg:{messageId}                → DMMessage (one row per message)
//   dm_queue:{account}:{senderId}     → DMQueuedReply (human reply waiting to send)

import { getSupabase } from "@/lib/supabase";

export type DMMode = "ai" | "human";
export type DMDirection = "in" | "out";

export type DMThread = {
  account: string;
  sender_id: string;
  username?: string;
  mode: DMMode;
  last_message_at: string;
  last_message_text: string;
  last_direction: DMDirection;
  unread_count: number;
  updated_at: string;
};

export type DMMessage = {
  id: string;
  account: string;
  sender_id: string;
  direction: DMDirection;
  text: string;
  source: "user" | "ai" | "human"; // user = incoming; ai/human = outgoing source
  at: string;
};

export type DMQueuedReply = {
  account: string;
  sender_id: string;
  reply: string;
  queued_at: string;
  queued_by?: string;
};

// ---------- Thread ----------

export async function getThread(account: string, sender_id: string): Promise<DMThread | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("discover_cache")
    .select("payload")
    .eq("cache_key", `dm_thread:${account}:${sender_id}`)
    .maybeSingle();
  return (data?.payload as DMThread) || null;
}

export async function upsertThread(t: DMThread): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("discover_cache").upsert(
    {
      cache_key: `dm_thread:${t.account}:${t.sender_id}`,
      source: "dm_thread",
      last_fetched: new Date().toISOString(),
      payload: { ...t, updated_at: new Date().toISOString() },
    },
    { onConflict: "cache_key" },
  );
}

export async function listThreads(account?: string): Promise<DMThread[]> {
  const db = getSupabase();
  if (!db) return [];
  const q = db.from("discover_cache").select("payload").eq("source", "dm_thread").order("last_fetched", { ascending: false }).limit(200);
  const { data } = await q;
  const threads = (data || []).map((r) => r.payload as DMThread);
  return account ? threads.filter((t) => t.account === account) : threads;
}

export async function setThreadMode(account: string, sender_id: string, mode: DMMode): Promise<DMThread | null> {
  const t = await getThread(account, sender_id);
  if (!t) return null;
  const updated = { ...t, mode };
  await upsertThread(updated);
  return updated;
}

// Clear unread when the dashboard opens a thread
export async function markThreadRead(account: string, sender_id: string): Promise<void> {
  const t = await getThread(account, sender_id);
  if (!t) return;
  await upsertThread({ ...t, unread_count: 0 });
}

// ---------- Messages ----------

export async function appendMessage(m: DMMessage): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("discover_cache").upsert(
    {
      cache_key: `dm_msg:${m.id}`,
      source: "dm_msg",
      last_fetched: new Date().toISOString(),
      payload: m,
    },
    { onConflict: "cache_key" },
  );
}

export async function listMessages(account: string, sender_id: string, limit = 100): Promise<DMMessage[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db.from("discover_cache").select("payload").eq("source", "dm_msg").like("cache_key", `dm_msg:%`).limit(2000);
  const all = (data || []).map((r) => r.payload as DMMessage);
  return all
    .filter((m) => m.account === account && m.sender_id === sender_id)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-limit);
}

// ---------- Reply queue ----------

export async function queueReply(q: DMQueuedReply): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  await db.from("discover_cache").upsert(
    {
      cache_key: `dm_queue:${q.account}:${q.sender_id}`,
      source: "dm_queue",
      last_fetched: new Date().toISOString(),
      payload: q,
    },
    { onConflict: "cache_key" },
  );
}

// Read and DELETE — single-shot delivery
export async function popQueuedReply(account: string, sender_id: string): Promise<DMQueuedReply | null> {
  const db = getSupabase();
  if (!db) return null;
  const cacheKey = `dm_queue:${account}:${sender_id}`;
  const { data } = await db.from("discover_cache").select("payload").eq("cache_key", cacheKey).maybeSingle();
  const q = (data?.payload as DMQueuedReply) || null;
  if (q) await db.from("discover_cache").delete().eq("cache_key", cacheKey);
  return q;
}

export async function peekQueuedReply(account: string, sender_id: string): Promise<DMQueuedReply | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("discover_cache").select("payload").eq("cache_key", `dm_queue:${account}:${sender_id}`).maybeSingle();
  return (data?.payload as DMQueuedReply) || null;
}

// ---------- High-level event recorders ----------

// Called when an inbound DM arrives (from n8n mirror)
export async function recordInbound(opts: { account: string; sender_id: string; username?: string; text: string; messageId?: string; at?: string }): Promise<DMThread> {
  const at = opts.at || new Date().toISOString();
  const messageId = opts.messageId || `in_${opts.sender_id}_${Date.now()}`;
  await appendMessage({ id: messageId, account: opts.account, sender_id: opts.sender_id, direction: "in", text: opts.text, source: "user", at });
  const existing = await getThread(opts.account, opts.sender_id);
  const thread: DMThread = {
    account: opts.account,
    sender_id: opts.sender_id,
    username: opts.username || existing?.username,
    mode: existing?.mode || "ai",
    last_message_at: at,
    last_message_text: opts.text,
    last_direction: "in",
    unread_count: (existing?.unread_count || 0) + 1,
    updated_at: at,
  };
  await upsertThread(thread);
  return thread;
}

// Called when an outbound DM is sent (AI or human)
export async function recordOutbound(opts: { account: string; sender_id: string; text: string; source: "ai" | "human"; messageId?: string; at?: string }): Promise<DMThread | null> {
  const at = opts.at || new Date().toISOString();
  const messageId = opts.messageId || `out_${opts.sender_id}_${Date.now()}`;
  await appendMessage({ id: messageId, account: opts.account, sender_id: opts.sender_id, direction: "out", text: opts.text, source: opts.source, at });
  const existing = await getThread(opts.account, opts.sender_id);
  if (!existing) return null;
  const thread: DMThread = {
    ...existing,
    last_message_at: at,
    last_message_text: opts.text,
    last_direction: "out",
    updated_at: at,
  };
  await upsertThread(thread);
  return thread;
}
