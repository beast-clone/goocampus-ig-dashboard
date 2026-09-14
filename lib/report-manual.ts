import { getSupabase } from "@/lib/supabase";

// The monthly report's hand-written sections (Achievements, Focused SBUs, etc.),
// saved per month so they persist and re-open. Stored in discover_cache (no
// migration): one row per month, key `report-manual:<YYYY-MM>`, source below.
const SOURCE = "report_manual";
const keyFor = (month: string) => `report-manual:${month}`;

export type ManualFields = {
  achievements: string;
  focusedSbus: string;
  amcEbook: string;
  newsletter: string;
  futureProspects: string;
  actionNotes: string;
};
export const MANUAL_KEYS: (keyof ManualFields)[] = [
  "achievements", "focusedSbus", "amcEbook", "newsletter", "futureProspects", "actionNotes",
];
const EMPTY: ManualFields = { achievements: "", focusedSbus: "", amcEbook: "", newsletter: "", futureProspects: "", actionNotes: "" };

export async function getManual(month: string): Promise<ManualFields> {
  const sb = getSupabase();
  if (!sb) return { ...EMPTY };
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", keyFor(month)).maybeSingle();
  return { ...EMPTY, ...((data?.payload as Partial<ManualFields>) || {}) };
}

export async function setManual(month: string, patch: Partial<ManualFields>): Promise<ManualFields> {
  const sb = getSupabase();
  if (!sb) throw new Error("database unavailable");
  const current = await getManual(month);
  const merged: ManualFields = { ...current };
  for (const k of MANUAL_KEYS) if (typeof patch[k] === "string") merged[k] = patch[k] as string;
  await sb.from("discover_cache").upsert(
    { cache_key: keyFor(month), source: SOURCE, last_fetched: new Date().toISOString(), payload: merged },
    { onConflict: "cache_key" },
  );
  return merged;
}
