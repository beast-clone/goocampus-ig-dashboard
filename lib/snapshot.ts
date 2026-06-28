// Long-term history: snapshot one day's Meta data per account into Supabase so
// it survives Meta's 30-day daily-data cutoff.

import { getConfiguredAccounts, fetchBasic, fetchAccountInsights, type IGAccountConfig } from "@/lib/instagram";
import { getSupabase } from "@/lib/supabase";

const GRAPH = "https://graph.facebook.com/v25.0";

export type AccountSnapshot = {
  accountId: string;
  date: string;            // YYYY-MM-DD (the day this row represents)
  followers: number;
  reach: number;
  profileVisits: number;
  websiteClicks: number;
  totalInteractions: number;
  capturedAt: string;
};

async function fetchDayMetric(acc: IGAccountConfig, metric: string, date: string): Promise<number> {
  const since = Math.floor(new Date(date + "T00:00:00Z").getTime() / 1000);
  const until = Math.floor(new Date(date + "T23:59:59Z").getTime() / 1000);
  // Try "day" period first; some metrics on newer accounts need metric_type=total_value
  try {
    const url = `${GRAPH}/${acc.igUserId}/insights?metric=${metric}&period=day&since=${since}&until=${until}&access_token=${acc.pageAccessToken}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = (await r.json()) as { data?: { values?: { value: number }[] }[] };
    return Number(j.data?.[0]?.values?.[0]?.value || 0);
  } catch {
    return 0;
  }
}

export async function snapshotAccountForDay(acc: IGAccountConfig, date: string): Promise<AccountSnapshot> {
  // Followers count is "now" — we record today's value for the snapshot date.
  const basic = await fetchBasic(acc).catch(() => ({ followers_count: 0 } as { followers_count: number }));

  // Daily metrics for the snapshot date
  const [reach, profileVisits, websiteClicks, totalInteractions] = await Promise.all([
    fetchDayMetric(acc, "reach", date),
    fetchDayMetric(acc, "profile_views", date),
    fetchDayMetric(acc, "website_clicks", date),
    fetchDayMetric(acc, "total_interactions", date),
  ]);

  return {
    accountId: acc.id,
    date,
    followers: basic.followers_count || 0,
    reach,
    profileVisits,
    websiteClicks,
    totalInteractions,
    capturedAt: new Date().toISOString(),
  };
}

export async function writeSnapshot(snap: AccountSnapshot): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: "Supabase not configured" };
  const cacheKey = `snapshot:${snap.accountId}:${snap.date}`;
  const { error } = await db.from("discover_cache").upsert(
    {
      cache_key: cacheKey,
      source: "account_snapshot",
      last_fetched: new Date().toISOString(),
      payload: snap,
    },
    { onConflict: "cache_key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function readSnapshots(accountId: string, fromDate: string, toDate: string): Promise<AccountSnapshot[]> {
  const db = getSupabase();
  if (!db) return [];
  // Use a `like` pattern on cache_key to pull all snapshots for this account,
  // then filter date range in memory (handful of rows; cheap).
  const { data } = await db
    .from("discover_cache")
    .select("payload")
    .like("cache_key", `snapshot:${accountId}:%`)
    .eq("source", "account_snapshot");
  if (!data) return [];
  return data
    .map((row) => row.payload as AccountSnapshot)
    .filter((s) => s.date >= fromDate && s.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Snapshot every configured account for a single day. Used for daily cron + backfill.
export async function snapshotAllAccountsForDay(date: string) {
  const accounts = getConfiguredAccounts();
  const results = await Promise.all(accounts.map(async (acc) => {
    try {
      const snap = await snapshotAccountForDay(acc, date);
      const w = await writeSnapshot(snap);
      return { accountId: acc.id, date, ok: w.ok, error: w.error, snap };
    } catch (e) {
      return { accountId: acc.id, date, ok: false, error: (e as Error).message };
    }
  }));
  return results;
}
