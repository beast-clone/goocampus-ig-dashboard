import { getSupabase } from "@/lib/supabase";

// Server-side log of dashboard comments (the bottom-right Comment widget), so the
// day's feedback can be emailed as one digest. The widget still keeps its own
// localStorage copy for pins/positions; this is an additive write for the digest.
// Stored in discover_cache (no migration): one row per comment, source below,
// last_fetched = the comment's timestamp (so the digest can query by day).
const SOURCE = "dash_comment";

export type StoredComment = {
  id: string; path: string; text: string; author: string; ts: number;
  // Where they were pointing (clicked element, its section, full URL, screen size).
  ctx?: { target?: string; section?: string; url?: string; viewport?: string };
  // Set from the admin Comments page. Kept in the same payload (no migration).
  resolved?: boolean; resolvedBy?: string; resolvedAt?: number;
  resolvedNote?: string; // what was done about it
};

export async function saveComment(c: StoredComment): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("discover_cache").upsert(
    { cache_key: `comment:${c.id}`, source: SOURCE, last_fetched: new Date(c.ts).toISOString(), payload: c },
    { onConflict: "cache_key" },
  );
}

// Comments created at/after `sinceIso`, oldest first.
export async function commentsSince(sinceIso: string): Promise<StoredComment[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("discover_cache")
    .select("payload")
    .eq("source", SOURCE)
    .gte("last_fetched", sinceIso)
    .order("last_fetched", { ascending: true });
  return (data || []).map((r) => r.payload as StoredComment).filter((c) => c && c.text);
}

// Every comment, newest first — the admin Comments page.
export async function listComments(limit = 500): Promise<StoredComment[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("discover_cache")
    .select("payload")
    .eq("source", SOURCE)
    .order("last_fetched", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.payload as StoredComment).filter((c) => c && c.text);
}

// Mark a comment resolved / reopen it. Returns false if it doesn't exist.
export async function setCommentResolved(id: string, resolved: boolean, by: string, note?: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const key = `comment:${id}`;
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", key).eq("source", SOURCE).maybeSingle();
  if (!data) return false;
  const c = data.payload as StoredComment;
  const next: StoredComment = resolved
    ? { ...c, resolved: true, resolvedBy: by, resolvedAt: Date.now(), resolvedNote: note?.trim() || undefined }
    : { ...c, resolved: false, resolvedBy: undefined, resolvedAt: undefined, resolvedNote: undefined };
  const { error } = await sb.from("discover_cache").update({ payload: next }).eq("cache_key", key);
  if (error) throw new Error(error.message);
  return true;
}
