// The live brand (SBU) list, read from Supabase `mh_sbus` (sql/027) so a brand
// added in the dashboard shows up everywhere without a deploy. Server-only —
// browsers get it through /api/sbus (lib/use-sbus.ts).
//
// Falls back to SBU_OPTIONS in lib/sbus.ts if the table can't be read, so a
// database hiccup never empties a brand picker or rejects a valid task.

import { getSupabase } from "@/lib/supabase";
import { SBU_OPTIONS } from "@/lib/sbus";

let cache: { at: number; names: string[] } | null = null;
const CACHE_MS = 30_000;

/** Active brands, A→Z. */
export async function fetchSbus(fresh = false): Promise<string[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.names;
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("mh_sbus").select("name").eq("active", true);
    if (!error && data && data.length > 0) {
      const names = (data as { name: string }[]).map((r) => r.name).sort((a, b) => a.localeCompare(b));
      cache = { at: Date.now(), names };
      return names;
    }
  }
  return [...SBU_OPTIONS];
}

export function invalidateSbus() {
  cache = null;
}

/** Add a brand. Returns the stored name; a case-insensitive match returns the existing one. */
export async function addSbu(raw: string, by: string | null): Promise<string> {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Type the brand's name.");
  if (name.length > 80) throw new Error("That name is too long.");
  const existing = (await fetchSbus(true)).find((n) => n.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const sb = getSupabase();
  if (!sb) throw new Error("no db");
  // Upsert so a brand that was switched off comes back instead of failing.
  const { error } = await sb.from("mh_sbus").upsert({ name, active: true, created_by: by }, { onConflict: "name" });
  if (error) throw new Error(error.message);
  invalidateSbus();
  return name;
}
