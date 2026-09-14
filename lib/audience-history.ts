// Monthly audience-demographics history.
//
// Meta's `follower_demographics` (used by lib/instagram fetchAudience) is a
// "right now" metric — there is NO historical version, so "who you reached in
// August" cannot be reconstructed after the fact. We therefore FREEZE the current
// audience once per month into Supabase, so each past month keeps its own record.
// (August's first freeze is effectively "today's audience" — the honest best we
// can do for a month that already passed; every month from the freeze onward is
// genuinely that month's.)
//
// Storage reuses `discover_cache`: cache_key = `audsnap:<accountId>:<YYYY-MM>`,
// source = `audience_month_snapshot`.

import { getConfiguredAccounts, getAccount, fetchAudience, fetchBasic, type IGAccountConfig } from "@/lib/instagram";
import { getSupabase } from "@/lib/supabase";
import { currentMonth } from "@/lib/post-history";

export type AudienceMonthSnapshot = {
  accountId: string;
  month: string;
  capturedAt: string;
  followers: number;
  audience: Awaited<ReturnType<typeof fetchAudience>>;
};

export async function snapshotAudienceForMonth(acc: IGAccountConfig, month: string): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: "Supabase not configured" };
  const [basic, audience] = await Promise.all([
    fetchBasic(acc).catch(() => ({ followers_count: 0 } as { followers_count: number })),
    fetchAudience(acc),
  ]);
  const payload: AudienceMonthSnapshot = {
    accountId: acc.id,
    month,
    capturedAt: new Date().toISOString(),
    followers: basic.followers_count || 0,
    audience,
  };
  const { error } = await db.from("discover_cache").upsert(
    { cache_key: `audsnap:${acc.id}:${month}`, source: "audience_month_snapshot", last_fetched: new Date().toISOString(), payload },
    { onConflict: "cache_key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function snapshotAllAccountsAudienceForMonth(month: string) {
  const accounts = getConfiguredAccounts();
  const results = [];
  for (const acc of accounts) {
    try {
      const r = await snapshotAudienceForMonth(acc, month);
      results.push({ accountId: acc.id, month, ...r });
    } catch (e) {
      results.push({ accountId: acc.id, month, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

export async function readAudienceMonthSnapshot(accountId: string, month: string): Promise<AudienceMonthSnapshot | null> {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db
    .from("discover_cache")
    .select("payload")
    .eq("cache_key", `audsnap:${accountId}:${month}`)
    .eq("source", "audience_month_snapshot")
    .maybeSingle();
  return (data?.payload as AudienceMonthSnapshot) ?? null;
}

export function accountExists(accountId: string): boolean {
  return !!getAccount(accountId);
}

export { currentMonth };
