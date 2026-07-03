// Content Radar — Supabase-backed store for topic subscriptions and cached items.
// An alert has EITHER a searchQuery (dashboard-native, uses Jina Search) OR a
// feedUrl (advanced: Google Alerts RSS pasted in from google.com/alerts). The
// refresh pipeline dispatches based on which is populated.

import { getSupabase } from "@/lib/supabase";
import { fetchAlertsFeed, RssItem } from "@/lib/google-alerts-rss";
import { fetchJinaSearch } from "@/lib/jina-search";

export type ContentAlert = {
  id: string;
  name: string;
  primaryInterest: string;
  feedUrl: string | null;
  searchQuery: string | null;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
};

export type ContentAlertItem = {
  id: string;
  alertId: string;
  alertName: string;
  primaryInterest: string;
  title: string;
  link: string;
  source: string | null;
  snippet: string;
  publishedAt: string;
  fetchedAt: string;
};

function db() {
  const s = getSupabase();
  if (!s) throw new Error("Supabase is not configured");
  return s;
}

/* -------- alerts CRUD -------- */

export async function listAlerts(): Promise<ContentAlert[]> {
  const { data, error } = await db()
    .from("content_alerts")
    .select("id, name, primary_interest, feed_url, search_query, active, last_fetched_at, last_error, created_at")
    .order("primary_interest", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: r.id, name: r.name, primaryInterest: r.primary_interest, feedUrl: r.feed_url, searchQuery: r.search_query,
    active: r.active, lastFetchedAt: r.last_fetched_at, lastError: r.last_error, createdAt: r.created_at,
  }));
}

export async function createAlert(input: { name: string; primaryInterest: string; feedUrl?: string; searchQuery?: string }): Promise<ContentAlert> {
  if (!input.feedUrl && !input.searchQuery) {
    throw new Error("Either feedUrl or searchQuery must be provided");
  }
  const { data, error } = await db()
    .from("content_alerts")
    .insert({
      name: input.name.trim(),
      primary_interest: input.primaryInterest.trim(),
      feed_url: input.feedUrl?.trim() || null,
      search_query: input.searchQuery?.trim() || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id, name: data.name, primaryInterest: data.primary_interest,
    feedUrl: data.feed_url, searchQuery: data.search_query,
    active: data.active, lastFetchedAt: data.last_fetched_at, lastError: data.last_error, createdAt: data.created_at,
  };
}

export async function deleteAlert(id: string): Promise<void> {
  const { error } = await db().from("content_alerts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleAlert(id: string, active: boolean): Promise<void> {
  const { error } = await db().from("content_alerts").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
}

/* -------- item cache + refresh -------- */

// Pull the latest N items across all active alerts, optionally filtered by interest.
export async function listItems(opts: { interest?: string; limit?: number } = {}): Promise<ContentAlertItem[]> {
  const limit = opts.limit ?? 200;
  let q = db()
    .from("content_alert_items")
    .select("id, alert_id, title, link, source, snippet, published_at, fetched_at, content_alerts!inner(name, primary_interest, active)")
    .eq("content_alerts.active", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (opts.interest && opts.interest !== "all") {
    q = q.eq("content_alerts.primary_interest", opts.interest);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r: Record<string, unknown>) => {
    const alert = r.content_alerts as { name: string; primary_interest: string } | null;
    return {
      id: r.id as string,
      alertId: r.alert_id as string,
      alertName: alert?.name ?? "?",
      primaryInterest: alert?.primary_interest ?? "?",
      title: r.title as string,
      link: r.link as string,
      source: r.source as string | null,
      snippet: r.snippet as string,
      publishedAt: r.published_at as string,
      fetchedAt: r.fetched_at as string,
    };
  });
}

// Fetch the feed URL, upsert new items, stamp last_fetched_at / last_error on the
// alert. Returns count of items inserted (excludes duplicates via unique constraint).
export async function refreshAlert(alertId: string): Promise<{ inserted: number; total: number }> {
  const supa = db();
  const { data: alert, error: aErr } = await supa
    .from("content_alerts")
    .select("id, feed_url, search_query, active")
    .eq("id", alertId)
    .single();
  if (aErr) throw new Error(aErr.message);
  if (!alert.active) return { inserted: 0, total: 0 };

  // Dispatch: prefer search_query (dashboard-native, Jina Search); fall back to
  // feed_url (Google Alerts RSS). One of the two must be set at insert time.
  let items: RssItem[] = [];
  try {
    if (alert.search_query) {
      items = await fetchJinaSearch(alert.search_query);
    } else if (alert.feed_url) {
      items = await fetchAlertsFeed(alert.feed_url);
    } else {
      throw new Error("Alert has neither a search query nor a feed URL");
    }
  } catch (e) {
    await supa.from("content_alerts").update({ last_fetched_at: new Date().toISOString(), last_error: (e as Error).message.slice(0, 500) }).eq("id", alertId);
    throw e;
  }

  if (items.length === 0) {
    await supa.from("content_alerts").update({ last_fetched_at: new Date().toISOString(), last_error: null }).eq("id", alertId);
    return { inserted: 0, total: 0 };
  }

  // Dedupe by both link AND normalized title before upsert. Postgres refuses
  // "ON CONFLICT DO UPDATE" when the same conflict key appears twice in one
  // statement, so link dedup is mandatory. Title dedup catches Bing/Google
  // returning the same story via multiple aggregator URLs.
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const rows = items
    .filter((it) => {
      const titleKey = it.title.trim().toLowerCase();
      if (seenLinks.has(it.link) || seenTitles.has(titleKey)) return false;
      seenLinks.add(it.link);
      seenTitles.add(titleKey);
      return true;
    })
    .map((it) => ({
      alert_id: alertId,
      title: it.title,
      link: it.link,
      source: it.source,
      snippet: it.snippet,
      published_at: it.publishedAt,
    }));

  const { data: inserted, error: iErr } = await supa
    .from("content_alert_items")
    .upsert(rows, { onConflict: "alert_id,link" })
    .select("id");
  if (iErr) {
    await supa.from("content_alerts").update({ last_fetched_at: new Date().toISOString(), last_error: iErr.message.slice(0, 500) }).eq("id", alertId);
    throw new Error(iErr.message);
  }

  await supa.from("content_alerts").update({ last_fetched_at: new Date().toISOString(), last_error: null }).eq("id", alertId);
  return { inserted: (inserted || []).length, total: items.length };
}

// Refresh every active alert. Returns per-alert stats. Never throws — errors are
// captured per alert and surfaced in the response.
export async function refreshAllActive(): Promise<Array<{ alertId: string; inserted: number; total: number; error?: string }>> {
  const supa = db();
  const { data, error } = await supa.from("content_alerts").select("id").eq("active", true);
  if (error) throw new Error(error.message);
  const ids = (data || []).map((r) => r.id as string);
  const results: Array<{ alertId: string; inserted: number; total: number; error?: string }> = [];
  for (const id of ids) {
    try {
      const r = await refreshAlert(id);
      results.push({ alertId: id, ...r });
    } catch (e) {
      results.push({ alertId: id, inserted: 0, total: 0, error: (e as Error).message });
    }
  }
  return results;
}
