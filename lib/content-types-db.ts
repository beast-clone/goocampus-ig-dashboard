// The live types of work (mh_content_types, sql/028). Server-only; browsers get
// them from /api/content-types (lib/use-content-types.ts). Reading also registers
// them into ALL_TYPES / VIDEO_TYPES, so warm this before any VIDEO_TYPES check.
// Falls back to the built-in lists if the table can't be read.

import { getSupabase } from "@/lib/supabase";
import { ALL_TYPES, VIDEO_TYPES, registerTypes, type TypeRow, type TypeKind } from "@/lib/mh-content-types";

let cache: { at: number; rows: TypeRow[] } | null = null;
const CACHE_MS = 30_000;

const builtIns = (): TypeRow[] => ALL_TYPES.map((name) => ({ name, kind: VIDEO_TYPES.has(name) ? "video" : "design" }));

/** Active types, in the order they were added (built-ins first). */
export async function fetchContentTypes(fresh = false): Promise<TypeRow[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from("mh_content_types").select("name, kind").eq("active", true).order("created_at");
    if (!error && data && data.length > 0) {
      const rows = data as TypeRow[];
      registerTypes(rows);
      cache = { at: Date.now(), rows };
      return rows;
    }
  }
  return builtIns();
}

/** Add a type of work. A case-insensitive match returns the existing one unchanged. */
export async function addContentType(raw: string, kindRaw: string, by: string | null): Promise<TypeRow> {
  const kind = kindRaw as TypeKind;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Type the name of the type of work.");
  if (name.length > 60) throw new Error("That name is too long.");
  if (kind !== "video" && kind !== "design") throw new Error("Say whether it is design or video work.");
  const existing = (await fetchContentTypes(true)).find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const sb = getSupabase();
  if (!sb) throw new Error("no db");
  const { error } = await sb.from("mh_content_types").upsert({ name, kind, active: true, created_by: by }, { onConflict: "name" });
  if (error) throw new Error(error.message);
  cache = null;
  await fetchContentTypes(true);
  return { name, kind };
}
