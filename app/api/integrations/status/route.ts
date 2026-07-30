import { NextResponse } from "next/server";
import { usageSnapshot, callsThisMonth, callsAllTime } from "@/lib/api-usage";
import { authPing as sendpulsePing } from "@/lib/sendpulse";
import { airtableList, CRM_TABLE } from "@/lib/sales-hub";
import { getIntegrationToken } from "@/lib/integration-tokens";

// GET /api/integrations/status
//
// One place to watch every integration's token health + how hard the dashboard
// is hitting each API. Two halves:
//   1. Per-provider health check (validity + real expiry where the provider
//      exposes it — Meta debug_token, LinkedIn introspectToken).
//   2. Live call-count snapshot from lib/api-usage (this server process).
//
// Every check is fail-soft and runs in parallel; one dead provider never blocks
// the rest. Cached 60s so the auto-refreshing page doesn't hammer upstreams.

export type Integration = {
  key: string;
  name: string;
  category: string;
  configured: boolean;
  status: "ok" | "warn" | "error" | "unknown";
  tokenType: string;
  expiresAt: number | null; // unix ms
  daysRemaining: number | null;
  detail: string;
  note?: string;
  usage?: { allTime: number; today: number; session: number; errors: number };
  // Optional quota/rate-limit meter shown inside the card. usedPct drives a bar
  // (real % where the provider exposes it); resetAt/note carry portal facts for
  // providers like LinkedIn that don't expose live usage via API.
  quota?: { label: string; usedPct?: number; detail: string; note?: string; resetAt?: number };
};

// Which api-usage provider labels roll up into each integration card. Meta's card
// covers three sub-APIs; the rest are 1:1. Providers we don't instrument resolve
// to 0 (no matching label), which is honest — the card shows "not tracked".
const USAGE_MAP: Record<string, string[]> = {
  meta: ["Instagram Graph", "Facebook Graph", "Meta Ads"],
  linkedin: ["LinkedIn"],
  youtube: ["YouTube"],
  airtable: ["Airtable"],
  sendpulse: ["SendPulse"],
  perplexity: ["Perplexity"],
  serper: ["Serper"],
  reddit: ["Reddit"],
  supabase: ["Supabase"],
  apify: ["Apify"],
  hikerapi: ["HikerAPI"],
};

type Payload = {
  integrations: Integration[];
  usage: ReturnType<typeof usageSnapshot>;
  rateLimit: { provider: string; callPct: number; cpuPct: number; timePct: number } | null;
  generatedAt: number;
  cached?: boolean;
};

let cache: { at: number; payload: Payload } | null = null;
const TTL_MS = 60 * 1000;

const has = (v?: string | null) => typeof v === "string" && v.trim().length > 0;
const daysFromMs = (ms: number | null) => (ms && ms > Date.now() ? Math.floor((ms - Date.now()) / 86_400_000) : ms ? 0 : null);

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

// ---- Meta (Instagram · Facebook · Ads share one long-lived user token) ----
async function checkMeta(): Promise<{ integ: Integration; rateLimit: Payload["rateLimit"] }> {
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET, userToken = await getIntegrationToken("meta");
  const base: Integration = {
    key: "meta", name: "Meta — Instagram · Facebook · Ads", category: "Social", configured: has(appId) && has(appSecret) && has(userToken),
    status: "unknown", tokenType: "Long-lived user token", expiresAt: null, daysRemaining: null, detail: "",
  };
  let rateLimit: Payload["rateLimit"] = null;
  if (!base.configured) return { integ: { ...base, status: "error", note: "Credentials missing" }, rateLimit };
  try {
    const r = await fetch(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(userToken!)}&access_token=${appId}|${appSecret}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j.error || !j.data) return { integ: { ...base, status: "error", note: j.error?.message || "debug_token failed" }, rateLimit };
    // Long-lived user tokens report expires_at=0 ("never") but DATA ACCESS still lapses
    // (~90d) — count down to the nearer real deadline so the tab shows true days-left.
    const tokenExp = typeof j.data.expires_at === "number" && j.data.expires_at > 0 ? j.data.expires_at : 0;
    const dataExp = typeof j.data.data_access_expires_at === "number" && j.data.data_access_expires_at > 0 ? j.data.data_access_expires_at : 0;
    const cands = [tokenExp, dataExp].filter((x) => x > 0);
    const expSec = cands.length ? Math.min(...cands) : null;
    const expiresAt = expSec ? expSec * 1000 : null;
    const days = daysFromMs(expiresAt);
    const scopes = Array.isArray(j.data.scopes) ? j.data.scopes.length : 0;
    // A cheap call just to read the rate-limit header Meta returns.
    try {
      const rr = await fetch(`https://graph.facebook.com/v25.0/me?fields=id&access_token=${encodeURIComponent(userToken!)}`, { cache: "no-store" });
      const usageHeader = rr.headers.get("x-app-usage");
      if (usageHeader) {
        const u = JSON.parse(usageHeader);
        rateLimit = { provider: "Meta", callPct: u.call_count ?? 0, cpuPct: u.total_cputime ?? 0, timePct: u.total_time ?? 0 };
      }
    } catch { /* header optional */ }
    const valid = j.data.is_valid === true;
    const status: Integration["status"] = !valid ? "error" : days !== null && days < 7 ? "warn" : "ok";
    return {
      integ: { ...base, status, expiresAt, daysRemaining: days, tokenType: expiresAt ? "Long-lived (60d)" : "Never expires", detail: `${scopes} scopes${days !== null ? ` · ${days}d left` : " · no expiry"}` },
      rateLimit,
    };
  } catch (e) {
    return { integ: { ...base, status: "error", note: (e as Error).message.slice(0, 120) }, rateLimit };
  }
}

// ---- LinkedIn (member token — introspect for real expiry) ----
async function checkLinkedIn(): Promise<Integration> {
  const token = await getIntegrationToken("linkedin"), cid = process.env.LINKEDIN_CLIENT_ID, secret = process.env.LINKEDIN_CLIENT_SECRET;
  const base: Integration = { key: "linkedin", name: "LinkedIn", category: "Social", configured: has(token), status: "unknown", tokenType: "OAuth member token (~60d)", expiresAt: null, daysRemaining: null, detail: "" };
  if (!base.configured) return { ...base, status: "error", note: "Access token missing" };
  if (!has(cid) || !has(secret)) return { ...base, status: "ok", detail: "Token present (introspection needs client id/secret)" };
  try {
    const body = new URLSearchParams({ client_id: cid!, client_secret: secret!, token: token! });
    const r = await fetch("https://www.linkedin.com/oauth/v2/introspectToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return { ...base, status: "error", note: j.message || `introspect ${r.status}` };
    const active = j.active === "true" || j.active === true;
    const expiresAt = typeof j.expires_at === "number" ? j.expires_at * 1000 : null;
    const days = daysFromMs(expiresAt);
    const status: Integration["status"] = !active ? "error" : days !== null && days < 10 ? "warn" : "ok";
    return { ...base, status, expiresAt, daysRemaining: days, detail: active ? (days !== null ? `${days}d left · ${j.scope ? String(j.scope).split(",").length + " scopes" : "active"}` : "active") : "inactive/expired" };
  } catch (e) {
    return { ...base, status: "error", note: (e as Error).message.slice(0, 120) };
  }
}

// ---- YouTube (OAuth refresh token — refresh to prove it still works) ----
async function checkYouTube(): Promise<Integration> {
  const cid = process.env.YOUTUBE_CLIENT_ID, secret = process.env.YOUTUBE_CLIENT_SECRET;
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN || (process.env.YOUTUBE_REFRESH_TOKENS || "").split(/[,\s]+/).filter(Boolean)[0];
  const channels = (process.env.YOUTUBE_CHANNEL_IDS || "").split(/[,\s]+/).filter(Boolean).length;
  const base: Integration = { key: "youtube", name: "YouTube", category: "Social", configured: has(cid) && has(secret) && has(refresh), status: "unknown", tokenType: "OAuth (auto-refresh)", expiresAt: null, daysRemaining: null, detail: `${channels} channel${channels === 1 ? "" : "s"}` };
  if (!base.configured) return { ...base, status: "error", note: "OAuth credentials missing" };
  try {
    const body = new URLSearchParams({ client_id: cid!, client_secret: secret!, refresh_token: refresh!, grant_type: "refresh_token" });
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j.error) return { ...base, status: "error", note: j.error_description || j.error || `token ${r.status}` };
    return { ...base, status: "ok", detail: `${channels} channel${channels === 1 ? "" : "s"} · refresh OK (access ~${Math.round((j.expires_in || 3600) / 60)}m)` };
  } catch (e) {
    return { ...base, status: "error", note: (e as Error).message.slice(0, 120) };
  }
}

// ---- Airtable (PAT — no expiry; validate with a 1-row read) ----
async function checkAirtable(): Promise<Integration> {
  const base: Integration = { key: "airtable", name: "Airtable", category: "Data", configured: has(process.env.AIRTABLE_API_KEY), status: "unknown", tokenType: "Personal access token (no expiry)", expiresAt: null, daysRemaining: null, detail: "" };
  if (!base.configured) return { ...base, status: "error", note: "API key missing" };
  try {
    const rows = await airtableList(CRM_TABLE, { fields: ["Full Name"], maxRecords: 1, pageSize: 1 });
    return { ...base, status: "ok", detail: `Sales Hub reachable · ${rows.length ? "records present" : "empty"}` };
  } catch (e) {
    return { ...base, status: "error", note: (e as Error).message.slice(0, 120) };
  }
}

// ---- SendPulse (OAuth client-credentials) ----
async function checkSendPulse(): Promise<Integration> {
  const base: Integration = { key: "sendpulse", name: "SendPulse", category: "Messaging", configured: has(process.env.SENDPULSE_CLIENT_ID) && has(process.env.SENDPULSE_CLIENT_SECRET), status: "unknown", tokenType: "OAuth client credentials", expiresAt: null, daysRemaining: null, detail: "" };
  if (!base.configured) return { ...base, status: "error", note: "Credentials missing" };
  try {
    const p = await sendpulsePing();
    return { ...base, status: p.ok ? "ok" : "error", detail: p.ok ? `${p.bots} bot${p.bots === 1 ? "" : "s"}` : "auth failed" };
  } catch (e) {
    return { ...base, status: "error", note: (e as Error).message.slice(0, 120) };
  }
}

// ---- Perplexity (API key — the dashboard's only LLM provider) ----
async function checkPerplexity(): Promise<Integration> {
  // Match lib/ai.ts: the project stores the key as PLANNER_SEARCH_KEY, so accept
  // either name — otherwise the status check falsely reports "not configured".
  const key = process.env.PERPLEXITY_API_KEY || process.env.PLANNER_SEARCH_KEY;
  const base: Integration = { key: "perplexity", name: "Perplexity", category: "AI", configured: has(key), status: "unknown", tokenType: "API key (no expiry)", expiresAt: null, daysRemaining: null, detail: "" };
  if (!base.configured) return { ...base, status: "error", note: "API key missing" };
  try {
    // Minimal sonar call just to confirm the key is live (Perplexity rejects
    // max_tokens:1, so keep it small-but-valid).
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: "ping" }], max_tokens: 16 }),
      cache: "no-store",
    });
    if (!r.ok) return { ...base, status: "error", note: `chat ${r.status}` };
    return { ...base, status: "ok", detail: "Reachable · sonar" };
  } catch (e) {
    return { ...base, status: "error", note: (e as Error).message.slice(0, 120) };
  }
}

// ---- Serper (web-search key powering Content Radar's Reddit/Quora/… lanes) ----
// No live ping: every Serper search costs a credit, so we validate by key
// presence only and show the credit meter from our own call counter.
function checkSerper(): Integration {
  const key = process.env.SERPER_API_KEY;
  const base: Integration = { key: "serper", name: "Serper (web search)", category: "Scraping", configured: has(key), status: "unknown", tokenType: "API key · 2,500 free credits (one-time)", expiresAt: null, daysRemaining: null, detail: "" };
  if (!base.configured) return { ...base, status: "warn", detail: "No key — Reddit/Quora/MouthShut/ValueMD run best-effort (often empty)", note: "Add SERPER_API_KEY to make the Content Radar site: lanes reliable. Free key at serper.dev." };
  return { ...base, status: "ok", detail: "Powers Content Radar site: lanes (Reddit · Quora · MouthShut · ValueMD)" };
}

// ---- Reddit (app-only OAuth — reads full threads for Content Radar) ----
// No live ping (avoids burning the rate limit); validate by credential presence.
function checkReddit(): Integration {
  const configured = has(process.env.REDDIT_CLIENT_ID) && has(process.env.REDDIT_CLIENT_SECRET);
  const base: Integration = { key: "reddit", name: "Reddit (thread reader)", category: "Social", configured, status: "unknown", tokenType: "App-only OAuth (client id + secret)", expiresAt: null, daysRemaining: null, detail: "" };
  if (!configured) return { ...base, status: "warn", detail: "No app — Reddit mentions show snippet only (no full thread inline)", note: "Register a free 'script' app at reddit.com/prefs/apps → set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET to read full threads + comments inside the dashboard." };
  return { ...base, status: "ok", detail: "Full Reddit threads + comments in Content Radar" };
}

// ---- Config-only providers (no cheap live check / no expiry) ----
function configOnly(key: string, name: string, category: string, envKeys: string[], tokenType: string): Integration {
  const configured = envKeys.every((k) => has(process.env[k]));
  return { key, name, category, configured, status: configured ? "ok" : "error", tokenType, expiresAt: null, daysRemaining: null, detail: configured ? "Key configured" : "Not configured", note: configured ? undefined : "Missing env key" };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...cache.payload, cached: true });
  }

  const T = 9000;
  const [meta, linkedin, youtube, airtable, sendpulse, perplexity] = await Promise.all([
    withTimeout(checkMeta(), T, { integ: { key: "meta", name: "Meta — Instagram · Facebook · Ads", category: "Social", configured: true, status: "warn", tokenType: "Long-lived user token", expiresAt: null, daysRemaining: null, detail: "", note: "check timed out" } as Integration, rateLimit: null }),
    withTimeout(checkLinkedIn(), T, { key: "linkedin", name: "LinkedIn", category: "Social", configured: true, status: "warn", tokenType: "OAuth member token", expiresAt: null, daysRemaining: null, detail: "", note: "check timed out" } as Integration),
    withTimeout(checkYouTube(), T, { key: "youtube", name: "YouTube", category: "Social", configured: true, status: "warn", tokenType: "OAuth", expiresAt: null, daysRemaining: null, detail: "", note: "check timed out" } as Integration),
    withTimeout(checkAirtable(), T, { key: "airtable", name: "Airtable", category: "Data", configured: true, status: "warn", tokenType: "PAT", expiresAt: null, daysRemaining: null, detail: "", note: "check timed out" } as Integration),
    withTimeout(checkSendPulse(), T, { key: "sendpulse", name: "SendPulse", category: "Messaging", configured: true, status: "warn", tokenType: "OAuth", expiresAt: null, daysRemaining: null, detail: "", note: "check timed out" } as Integration),
    withTimeout(checkPerplexity(), T, { key: "perplexity", name: "Perplexity", category: "AI", configured: true, status: "warn", tokenType: "API key", expiresAt: null, daysRemaining: null, detail: "", note: "check timed out" } as Integration),
  ]);

  const integrations: Integration[] = [
    meta.integ,
    linkedin,
    youtube,
    airtable,
    sendpulse,
    perplexity,
    checkSerper(),
    checkReddit(),
    configOnly("supabase", "Supabase", "Data", ["SUPABASE_URL", "SUPABASE_SECRET_KEY"], "Service key (no expiry)"),
    configOnly("apify", "Apify", "Scraping", ["APIFY_API_TOKEN"], "API token (no expiry)"),
    configOnly("hikerapi", "HikerAPI", "Scraping", ["HIKERAPI_KEY"], "API key (no expiry)"),
  ];

  // Attach each integration's own call counts (Meta rolls up its 3 sub-APIs).
  const usage = usageSnapshot();
  const byProvider = new Map(usage.rows.map((r) => [r.provider, r]));
  for (const integ of integrations) {
    let allTime = 0, today = 0, session = 0, errors = 0;
    for (const name of USAGE_MAP[integ.key] || []) {
      const r = byProvider.get(name);
      if (r) { allTime += r.allTime; today += r.today; session += r.calls; errors += r.allTimeErrors; }
    }
    integ.usage = { allTime, today, session, errors };
  }

  // Quota meters inside the cards.
  //  • Meta exposes a real rolling rate-limit % (x-app-usage).
  //  • LinkedIn exposes NO quota header — its limits live only in the dev portal —
  //    so we meter calls-used-today against a configurable daily limit.
  const metaInteg = integrations.find((i) => i.key === "meta");
  if (metaInteg && meta.rateLimit) {
    metaInteg.quota = { label: "Rate limit (rolling)", usedPct: meta.rateLimit.callPct, detail: `${meta.rateLimit.callPct}% of Meta's hourly allowance used` };
  }
  const liInteg = integrations.find((i) => i.key === "linkedin");
  if (liInteg) {
    // LinkedIn quotas are per-endpoint and reset at 00:00 UTC. LinkedIn exposes
    // no live usage via API, so we show OUR call count + the real portal limits,
    // and never a fabricated "used/limit" percentage.
    const usedToday = liInteg.usage?.today || 0;
    const now = new Date();
    const resetAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
    liInteg.quota = {
      label: "24h quotas · reset 00:00 UTC",
      detail: `${usedToday.toLocaleString("en-IN")} call${usedToday === 1 ? "" : "s"} today from this dashboard`,
      note: "LinkedIn enforces per-endpoint 24h limits (most analytics endpoints 500/day; industries-BATCH_GET 2/day; OAuth refresh 1,000,000/app). Authoritative per-endpoint usage lives in the LinkedIn dev portal — it isn't exposed via the API.",
      resetAt,
    };
  }
  // YouTube Data API: fixed 10,000 units/day (units, not calls — search=100, list=1).
  // Usage lives in Google Cloud Console; the API doesn't return it.
  const ytInteg = integrations.find((i) => i.key === "youtube");
  if (ytInteg) {
    const yt = new Date();
    // Quota resets at midnight Pacific. July = PDT (UTC−7) → 07:00 UTC.
    let ytReset = Date.UTC(yt.getUTCFullYear(), yt.getUTCMonth(), yt.getUTCDate(), 7, 0, 0);
    if (ytReset <= Date.now()) ytReset += 86_400_000;
    ytInteg.quota = {
      label: "Daily quota · reset midnight PT",
      detail: `${(ytInteg.usage?.today || 0).toLocaleString("en-IN")} calls today from this dashboard · limit 10,000 units/day`,
      note: "YouTube bills per unit (a search costs 100, a list costs 1), so calls ≠ units. Live unit usage shows in Google Cloud Console, not the API.",
      resetAt: ytReset,
    };
  }
  // Airtable: 5 requests/second per base (documented; returns 429 + Retry-After).
  const atInteg = integrations.find((i) => i.key === "airtable");
  if (atInteg) {
    atInteg.quota = {
      label: "Limits · monthly credits",
      detail: "Monthly API-call allowance per workspace + 5 req/sec per base",
      note: "Airtable's main budget is a MONTHLY API-call allowance per workspace (varies by plan — check Airtable billing) and is SHARED with your n8n workflows. It resets monthly, not daily. The 5 req/sec cap returns 429 + Retry-After when exceeded.",
    };
  }

  // Serper: one-time 2,500 free credits (no monthly renew). Show credits spent vs
  // the free bucket + this month's self-imposed cap (SERPER_MONTHLY_BUDGET).
  const serperInteg = integrations.find((i) => i.key === "serper");
  if (serperInteg) {
    const FREE = 2500;
    const cap = Number(process.env.SERPER_MONTHLY_BUDGET) || 200;
    const usedAll = callsAllTime("Serper");
    const usedMonth = callsThisMonth("Serper");
    serperInteg.quota = {
      label: "Free credits · one-time",
      usedPct: Math.min(100, Math.round((usedAll / FREE) * 100)),
      detail: `${usedAll.toLocaleString("en-IN")} / ${FREE.toLocaleString("en-IN")} free credits used · ${usedMonth}/${cap} this month`,
      note: `Serper's 2,500 free credits are ONE-TIME (no monthly renew). The dashboard caps itself at ${cap} searches/month and caches results 6h, so the free bucket lasts ~a year. Past the monthly cap the site: lanes fall back to empty; Google News is unaffected. 1 search = 1 credit.`,
    };
  }

  const payload: Payload = {
    integrations,
    usage,
    rateLimit: meta.rateLimit,
    generatedAt: Date.now(),
  };
  cache = { at: Date.now(), payload };
  return NextResponse.json({ ...payload, cached: false });
}
