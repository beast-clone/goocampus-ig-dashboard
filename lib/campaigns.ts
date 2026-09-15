// Marketing Campaigns — event lead lists that live in a Google Sheet.
//
// There is deliberately NO copy of the leads here. They are read from the sheet
// when the page loads and written straight back when someone edits. A second
// copy would mean two places to diverge, a sync to get wrong, and a migration to
// run by hand — all to hold data that already has a home.
//
// The only thing stored is each campaign's settings: which spreadsheet, which
// tab, which column identifies a row, and how its columns map to our fields.
// That is a few hundred bytes, so it lives in `discover_cache`, the key-value
// store the dashboard already uses for report snapshots and onboarding state.
//
// What this costs, so it is written down rather than discovered later:
//   - every page load calls the Sheets API (one request for a tab; the quota is
//     300 requests/minute, so this is not close to a limit)
//   - no cross-campaign queries and no history, because nothing is retained. If
//     "every lead across every event" is ever wanted, THAT is the reason to add
//     storage — not before.

import { getSupabase } from "@/lib/supabase";

export type CampaignConfig = {
  id: string;
  name: string;
  /** Google spreadsheet id, from its URL. */
  spreadsheetId: string;
  /** Tab name within that spreadsheet. */
  tab: string;
  /** Which of the sheet's own column headers identifies a row. Write-back matches on it. */
  keyColumn: string;
  /** Sheet column header -> our field name. Headers not listed are carried but not shown. */
  columnMap: Record<string, string>;
  /** Which column the status dropdown edits. Chosen, never guessed — see the API. */
  statusColumn?: string | null;
  /** Which column free-text notes are written to. */
  notesColumn?: string | null;
  createdAt: string;
  createdBy: string | null;
};

const SOURCE = "campaign";
const keyFor = (id: string) => `campaign:${id}`;

export async function listCampaigns(): Promise<CampaignConfig[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data } = await db
    .from("discover_cache")
    .select("payload")
    .eq("source", SOURCE)
    .order("last_fetched", { ascending: false });
  return (data || [])
    .map((r) => r.payload as CampaignConfig)
    .filter((c): c is CampaignConfig => Boolean(c?.id && c?.spreadsheetId));
}

export async function getCampaign(id: string): Promise<CampaignConfig | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("discover_cache")
    .select("payload")
    .eq("cache_key", keyFor(id))
    .maybeSingle();
  return (data?.payload as CampaignConfig) || null;
}

export async function saveCampaign(c: CampaignConfig): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const { error } = await db.from("discover_cache").upsert(
    { cache_key: keyFor(c.id), source: SOURCE, last_fetched: new Date().toISOString(), payload: c },
    { onConflict: "cache_key" },
  );
  return !error;
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const db = getSupabase();
  if (!db) return false;
  const { error } = await db.from("discover_cache").delete().eq("cache_key", keyFor(id));
  return !error;
}
