// Facebook Page analytics (live side of /api/facebook).
//
// Uses the SAME per-brand page access tokens that power the Instagram tabs
// (accounts.local.json / ACCOUNTS_JSON via lib/instagram.ts getAccount) — each
// stored account carries pageId + pageAccessToken for its linked Facebook Page.
//
// What the current tokens can and cannot read (probed 2026-07-11, Graph v25.0):
//   ✓ Page profile     — name, followers_count, fan_count, picture, link (all 4 pages)
//   ✗ Page insights    — /insights returns an EMPTY data array for every valid
//                        metric (page_post_engagements, page_views_total, …) because
//                        the tokens lack the read_insights permission. Older metric
//                        names (page_impressions*, page_fans) are gone from v25 anyway.
//   ± Published posts  — /published_posts works with basic fields (message,
//                        created_time, full_picture, permalink_url) but 400s on
//                        likes.summary/comments.summary/reactions.summary
//                        (needs pages_read_engagement / pages_read_user_content).
//                        12thplusdotcom 403s entirely (admin permission / 2FA).
//
// Anything unreadable is returned as null / available:false — the UI shows "—".
// To unlock insights + per-post likes/comments, regenerate the page tokens with
// read_insights + pages_read_engagement + pages_read_user_content scopes.

import { fetchWithTimeout } from "./fetch-with-timeout";
import { recordApiCall } from "./api-usage";
import { metaLimiter } from "./concurrency";
import type { IGAccountConfig } from "./instagram";

const GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function fbGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await metaLimiter(() => fetchWithTimeout(`${GRAPH}/${path}?${qs}`, { cache: "no-store" }));
  recordApiCall("Facebook Graph", res.ok, res.status);
  if (!res.ok) {
    const body = await res.text();
    let msg = `Meta API ${res.status}`;
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch { /* keep the generic message */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

// ----- Page profile (followers) — WORKS on all stored tokens -----

export type FBPageProfile = {
  name: string;
  followers: number | null;
  fanCount: number | null;
  link: string | null;
  picture: string | null;
};

export async function fetchPageProfile(acc: IGAccountConfig): Promise<FBPageProfile> {
  if (!acc.pageId) throw new Error("Account has no Facebook pageId configured");
  const r = await fbGet<{
    name?: string;
    followers_count?: number;
    fan_count?: number;
    link?: string;
    picture?: { data?: { url?: string } };
  }>(acc.pageId, {
    fields: "name,followers_count,fan_count,link,picture{url}",
    access_token: acc.pageAccessToken,
  });
  return {
    name: r.name || acc.label,
    followers: typeof r.followers_count === "number" ? r.followers_count : null,
    fanCount: typeof r.fan_count === "number" ? r.fan_count : null,
    link: r.link || null,
    picture: r.picture?.data?.url || null,
  };
}

// ----- Page insights — the tokens lack read_insights, so this comes back empty.
// We still ATTEMPT the call every time: the moment a re-generated token with the
// read_insights scope lands in accounts.local.json, real numbers flow through
// with zero code changes. -----

export type FBInsights = {
  available: boolean;
  reason?: string;
  // Totals for the requested range; null = the token can't read it.
  reach: number | null;        // no readable reach metric on Graph v25 (page_impressions_unique was removed) — stays null
  engagement: number | null;   // page_post_engagements
  pageViews: number | null;    // page_views_total
  follows: number | null;      // page_follows
};

// ----- Audience geography — page_follows_country is the ONE demographic metric
// Meta still exposes on Graph v25 (fans_country/city/gender_age are all removed).
// It's a snapshot of current followers by ISO country code. -----

export type FBAudience = {
  available: boolean;
  reason?: string;
  countries: { code: string; count: number; pct: number }[];
};

export async function fetchPageAudience(acc: IGAccountConfig): Promise<FBAudience> {
  if (!acc.pageId) return { available: false, reason: "no pageId", countries: [] };
  try {
    type Metric = { name: string; values?: { value?: Record<string, number> }[] };
    const r = await fbGet<{ data?: Metric[] }>(`${acc.pageId}/insights`, {
      metric: "page_follows_country",
      period: "day",
      access_token: acc.pageAccessToken,
    });
    const vals = r.data?.[0]?.values ?? [];
    const latest = vals[vals.length - 1]?.value;
    if (!latest || typeof latest !== "object") {
      return { available: false, reason: "no country data returned", countries: [] };
    }
    const entries = Object.entries(latest).filter(([, n]) => typeof n === "number" && n > 0);
    const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
    const countries = entries
      .map(([code, count]) => ({ code, count, pct: Math.round((count / total) * 1000) / 10 }))
      .sort((a, b) => b.count - a.count);
    return { available: true, countries };
  } catch (e) {
    return { available: false, reason: (e as Error).message, countries: [] };
  }
}

export async function fetchPageInsights(acc: IGAccountConfig, fromIso: string, toIso: string): Promise<FBInsights> {
  const unavailable: FBInsights = {
    available: false,
    reason: "page token lacks the read_insights permission",
    reach: null,
    engagement: null,
    pageViews: null,
    follows: null,
  };
  if (!acc.pageId) return unavailable;

  // Meta's page-insights endpoint returns [] for any since/until span wider than
  // ~90 days. So for long ranges (the 60-day and 1-year views) we split the range
  // into ≤90-day windows, fetch them in parallel, and sum the daily totals — a
  // full year aggregates correctly instead of coming back empty. Short ranges are
  // a single window, unchanged.
  const WINDOW_MS = 90 * 86400_000;
  const startMs = new Date(fromIso + "T00:00:00Z").getTime();
  const endMs = new Date(toIso + "T23:59:59Z").getTime();
  const windows: { since: number; until: number }[] = [];
  for (let s = startMs; s <= endMs; s += WINDOW_MS) {
    const u = Math.min(s + WINDOW_MS - 1000, endMs);
    windows.push({ since: Math.floor(s / 1000), until: Math.floor(u / 1000) });
  }

  type Metric = { name: string; values?: { end_time: string; value: number }[] };
  const fetchWindow = async (since: number, until: number) => {
    const r = await fbGet<{ data?: Metric[] }>(`${acc.pageId}/insights`, {
      metric: "page_post_engagements,page_views_total,page_follows",
      period: "day",
      since: String(since),
      until: String(until),
      access_token: acc.pageAccessToken,
    });
    const data = r.data || [];
    if (!data.length) return null; // no read_insights, or an empty window
    const total = (name: string): number | null => {
      const m = data.find((d) => d.name === name);
      if (!m || !m.values?.length) return null;
      return m.values.reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);
    };
    return {
      engagement: total("page_post_engagements"),
      pageViews: total("page_views_total"),
      follows: total("page_follows"),
    };
  };

  try {
    const parts = await Promise.all(windows.map((w) => fetchWindow(w.since, w.until).catch(() => null)));
    const got = parts.filter(Boolean) as { engagement: number | null; pageViews: number | null; follows: number | null }[];
    if (!got.length) return unavailable; // Meta returns [] without read_insights (or every window empty)
    const sumField = (key: "engagement" | "pageViews" | "follows"): number | null => {
      const vals = got.map((g) => g[key]).filter((v): v is number => typeof v === "number");
      return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
    };
    return {
      available: true,
      reach: null, // Graph v25 exposes no reach metric readable by page tokens
      engagement: sumField("engagement"),
      pageViews: sumField("pageViews"),
      follows: sumField("follows"),
    };
  } catch (e) {
    return { ...unavailable, reason: (e as Error).message };
  }
}

// ----- Recent published posts — basic fields only (no likes/comments summaries;
// those 400 without pages_read_engagement). shares is accepted but Meta omits it
// on these tokens, so it surfaces as null → "—". -----

export type FBPost = {
  id: string;
  message: string;
  createdTime: string;
  fullPicture: string | null;
  permalink: string | null;
  likes: number | null;     // unreadable with current tokens → null
  comments: number | null;  // unreadable with current tokens → null
  shares: number | null;    // omitted by Meta on these tokens → null
};

export type FBPosts = {
  available: boolean;
  reason?: string;
  items: FBPost[];
};

export async function fetchPagePosts(acc: IGAccountConfig, limit = 12): Promise<FBPosts> {
  if (!acc.pageId) return { available: false, reason: "Account has no Facebook pageId configured", items: [] };
  try {
    type RawPost = {
      id: string;
      message?: string;
      created_time: string;
      full_picture?: string;
      permalink_url?: string;
      shares?: { count?: number };
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    };
    // Rich fields need pages_read_engagement (likes) + pages_read_user_content
    // (comments) — granted in the 2026-07-12 token rotation. If a future token
    // loses them, fall back to the basic fields so posts never disappear.
    const RICH = "id,message,created_time,full_picture,permalink_url,shares,likes.summary(true),comments.summary(true)";
    const BASIC = "id,message,created_time,full_picture,permalink_url,shares";
    let r: { data?: RawPost[] };
    try {
      r = await fbGet<{ data?: RawPost[] }>(`${acc.pageId}/published_posts`, {
        fields: RICH,
        limit: String(limit),
        access_token: acc.pageAccessToken,
      });
    } catch {
      r = await fbGet<{ data?: RawPost[] }>(`${acc.pageId}/published_posts`, {
        fields: BASIC,
        limit: String(limit),
        access_token: acc.pageAccessToken,
      });
    }
    const items: FBPost[] = (r.data || []).map((p) => ({
      id: p.id,
      message: p.message || "",
      createdTime: p.created_time,
      fullPicture: p.full_picture || null,
      permalink: p.permalink_url || null,
      likes: typeof p.likes?.summary?.total_count === "number" ? p.likes.summary.total_count : null,
      comments: typeof p.comments?.summary?.total_count === "number" ? p.comments.summary.total_count : null,
      shares: typeof p.shares?.count === "number" ? p.shares.count : null,
    }));
    return { available: true, items };
  } catch (e) {
    return { available: false, reason: (e as Error).message, items: [] };
  }
}
