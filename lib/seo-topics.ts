import { getSupabase } from "@/lib/supabase";

// Custom keyword topics the team adds on the SEO tab ("+ Add topic"). A topic is a
// name + the words that identify it; every tracked keyword/hashtag containing one of
// those words is shown in its group. AI suggestions, once asked for, are kept on the
// topic (per platform) so nobody pays for them twice.
// Stored in discover_cache (no migration), one row per topic.
const SOURCE = "seo_topic";

export type SeoTopic = {
  id: string; name: string; words: string[];
  suggestions?: { instagram?: string[]; youtube?: string[] };
  createdBy?: string; createdAt: string;
};

export async function listTopics(): Promise<SeoTopic[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("discover_cache").select("payload").eq("source", SOURCE).order("last_fetched", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.payload as SeoTopic).filter((t) => t?.id);
}

export async function getTopic(id: string): Promise<SeoTopic | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", `seo-topic:${id}`).eq("source", SOURCE).maybeSingle();
  return (data?.payload as SeoTopic) || null;
}

export async function saveTopic(t: SeoTopic): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Database isn't configured.");
  const { error } = await sb.from("discover_cache").upsert(
    { cache_key: `seo-topic:${t.id}`, source: SOURCE, last_fetched: t.createdAt, payload: t }, { onConflict: "cache_key" });
  if (error) throw new Error(error.message);
}

export async function deleteTopic(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from("discover_cache").delete().eq("cache_key", `seo-topic:${id}`).eq("source", SOURCE);
  if (error) throw new Error(error.message);
}
