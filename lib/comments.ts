import { getSupabase } from "@/lib/supabase";

// Server-side log of dashboard comments (the bottom-right Comment widget), so the
// day's feedback can be emailed as one digest. The widget still keeps its own
// localStorage copy for pins/positions; this is an additive write for the digest.
// Stored in discover_cache (no migration): one row per comment, source below,
// last_fetched = the comment's timestamp (so the digest can query by day).
const SOURCE = "dash_comment";

export type StoredComment = { id: string; path: string; text: string; author: string; ts: number };

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
