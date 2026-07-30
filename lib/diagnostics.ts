// Diagnostics engine — runs a liveness probe on every system, auto-repairs what
// it safely can (one retry on transient failure; YouTube token auto-refresh),
// measures host health (RAM / uptime / per-service latency), and stores a report
// row in `mh_diagnostics_runs`. Runs on-demand (Run button) or daily via cron.
//
// Purpose-built and self-contained: this is "is it working right now + fix it +
// history", distinct from the Integrations tab's credential inventory.

import os from "os";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { getSupabase } from "@/lib/supabase";
import { getIntegrationToken } from "@/lib/integration-tokens";
import { callsAllTime } from "@/lib/api-usage";
import { authPing as sendpulsePing } from "@/lib/sendpulse";
import { airtableList, CRM_TABLE } from "@/lib/sales-hub";

export type SysStatus = "ok" | "warn" | "error";
export type SysAction = { type: "reconnect" | "add-key" | "clear-cache"; label: string; provider?: string };
export type SystemResult = {
  key: string;
  name: string;
  category: string;
  status: SysStatus;
  detail: string;
  expiresAt: number | null;
  latencyMs: number | null;
  repair?: { action: string; result: "fixed" | "failed"; note: string };
  action?: SysAction;
};
export type DiagnosticsReport = {
  ranAt: number;
  trigger: "manual" | "cron";
  summary: { checked: number; healthy: number; warn: number; error: number; repaired: number; needsYou: number };
  systems: SystemResult[];
  repairs: { system: string; action: string; result: string; note: string }[];
  host: ReturnType<typeof hostHealth>;
  durationMs: number;
};

const has = (v?: string | null) => typeof v === "string" && v.trim().length > 0;
const daysLeft = (ms: number | null) => (ms ? Math.floor((ms - Date.now()) / 86_400_000) : null);

// Run `fn`; on failure retry ONCE (transient auto-repair). ok()/onFail() shape the
// result. A first-fail-then-succeed is recorded as a "fixed via retry" repair.
async function probe(
  meta: { key: string; name: string; category: string },
  fn: () => Promise<unknown>,
  ok: (val: unknown) => { status: SysStatus; detail: string; expiresAt?: number | null; action?: SysAction },
  onFail: (err: string) => { detail: string; action?: SysAction },
): Promise<SystemResult> {
  const t0 = Date.now();
  let firstErr: string | null = null;
  let val: unknown;
  try {
    val = await fn();
  } catch (e) {
    firstErr = (e as Error).message;
    try {
      val = await fn();
    } catch (e2) {
      const f = onFail((e2 as Error).message);
      return { ...meta, status: "error", detail: f.detail, expiresAt: null, latencyMs: Date.now() - t0, action: f.action, repair: { action: "retry", result: "failed", note: "Retried once; still failing." } };
    }
  }
  const o = ok(val);
  return { ...meta, status: o.status, detail: o.detail, expiresAt: o.expiresAt ?? null, latencyMs: Date.now() - t0, action: o.action, repair: firstErr ? { action: "retry", result: "fixed", note: "Transient error cleared on the automatic retry." } : undefined };
}

function keyCheck(key: string, name: string, category: string, present: boolean, okDetail: string, missDetail: string, missStatus: SysStatus = "error", action?: SysAction): SystemResult {
  return present
    ? { key, name, category, status: "ok", detail: okDetail, expiresAt: null, latencyMs: null }
    : { key, name, category, status: missStatus, detail: missDetail, expiresAt: null, latencyMs: null, action };
}

// ---------- probes ----------
async function probeSupabase(): Promise<SystemResult> {
  return probe(
    { key: "supabase", name: "Supabase (database)", category: "Database" },
    async () => { const s = getSupabase(); if (!s) throw new Error("Supabase not configured"); const r = await s.from("mh_posts").select("id").limit(1); if (r.error) throw new Error(r.error.message); return r.data; },
    () => ({ status: "ok", detail: "Connected · service key (no expiry)" }),
    (err) => ({ detail: `Unreachable: ${err}` }),
  );
}

async function probeMeta(): Promise<SystemResult> {
  const meta = { key: "meta", name: "Meta — Instagram · Facebook · Ads", category: "Social" };
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET;
  const token = await getIntegrationToken("meta");
  if (!has(appId) || !has(appSecret) || !has(token)) return { ...meta, status: "error", detail: "Credentials missing", expiresAt: null, latencyMs: null, action: { type: "reconnect", label: "Reconnect", provider: "meta" } };
  return probe(
    meta,
    async () => { const r = await fetchWithTimeout(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token!)}&access_token=${appId}|${appSecret}`, { timeoutMs: 8000, cache: "no-store" }); const j = await r.json(); if (!r.ok || j.error || !j.data) throw new Error(j.error?.message || "debug_token failed"); return j.data; },
    (val) => {
      const d = val as { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number };
      // expires_at can be 0 ("never") while data access still lapses (~90d) — count down
      // to the nearer real deadline so the tab shows true days-left, not "no expiry".
      const tokenExp = typeof d.expires_at === "number" && d.expires_at > 0 ? d.expires_at : 0;
      const dataExp = typeof d.data_access_expires_at === "number" && d.data_access_expires_at > 0 ? d.data_access_expires_at : 0;
      const cands = [tokenExp, dataExp].filter((x) => x > 0);
      const expiresAt = cands.length ? Math.min(...cands) * 1000 : null;
      const days = daysLeft(expiresAt);
      if (d.is_valid !== true) return { status: "error", detail: "Token invalid", expiresAt, action: { type: "reconnect", label: "Reconnect", provider: "meta" } };
      const status: SysStatus = days !== null && days < 14 ? "warn" : "ok";
      return { status, detail: days !== null ? `Valid · ${days}d left` : "Valid · no expiry", expiresAt, action: status !== null && status === "warn" ? { type: "reconnect", label: "Reconnect early", provider: "meta" } : undefined };
    },
    (err) => ({ detail: `Check failed: ${err.slice(0, 80)}`, action: { type: "reconnect", label: "Reconnect", provider: "meta" } }),
  );
}

async function firstYoutubeRefresh(): Promise<string | null> {
  // Reconnected refresh token (Supabase override) wins; getIntegrationToken falls back
  // to YOUTUBE_REFRESH_TOKEN, then the per-channel YOUTUBE_REFRESH_TOKENS map.
  const override = await getIntegrationToken("youtube");
  if (has(override)) return override!;
  const raw = process.env.YOUTUBE_REFRESH_TOKENS || "";
  try { const o = JSON.parse(raw) as Record<string, unknown>; const v = Object.values(o).find((x) => typeof x === "string"); if (v) return v as string; } catch { /* not json */ }
  return raw.split(/[,\s]+/).filter(Boolean)[0] || null;
}
async function probeYouTube(): Promise<SystemResult> {
  const meta = { key: "youtube", name: "YouTube", category: "Social" };
  const cid = process.env.YOUTUBE_CLIENT_ID, secret = process.env.YOUTUBE_CLIENT_SECRET, refresh = await firstYoutubeRefresh();
  if (!has(cid) || !has(secret) || !refresh) return { ...meta, status: "error", detail: "OAuth credentials missing", expiresAt: null, latencyMs: null, action: { type: "reconnect", label: "Reconnect", provider: "youtube" } };
  return probe(
    meta,
    async () => { const body = new URLSearchParams({ client_id: cid!, client_secret: secret!, refresh_token: refresh!, grant_type: "refresh_token" }); const r = await fetchWithTimeout("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, timeoutMs: 8000, cache: "no-store" }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error_description || j.error || "refresh failed"); return j; },
    () => ({ status: "ok", detail: "OAuth refresh OK · access token auto-renews hourly" }),
    (err) => ({ detail: `Refresh failed: ${err.slice(0, 80)}`, action: { type: "reconnect", label: "Reconnect", provider: "youtube" } }),
  );
}

async function probeLinkedIn(): Promise<SystemResult> {
  const meta = { key: "linkedin", name: "LinkedIn", category: "Social" };
  const token = await getIntegrationToken("linkedin");
  const cid = process.env.LINKEDIN_CLIENT_ID, secret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!has(token)) return { ...meta, status: "error", detail: "Access token missing", expiresAt: null, latencyMs: null, action: { type: "reconnect", label: "Reconnect", provider: "linkedin" } };
  if (!has(cid) || !has(secret)) return { ...meta, status: "ok", detail: "Token present (introspection needs client id/secret)", expiresAt: null, latencyMs: null };
  return probe(
    meta,
    async () => { const body = new URLSearchParams({ client_id: cid!, client_secret: secret!, token: token! }); const r = await fetchWithTimeout("https://www.linkedin.com/oauth/v2/introspectToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, timeoutMs: 8000, cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.message || `introspect ${r.status}`); return j; },
    (val) => {
      const j = val as { active?: string | boolean; expires_at?: number };
      const active = j.active === "true" || j.active === true;
      const expiresAt = typeof j.expires_at === "number" ? j.expires_at * 1000 : null;
      const days = daysLeft(expiresAt);
      if (!active) return { status: "error", detail: "Token inactive / expired", expiresAt, action: { type: "reconnect", label: "Reconnect", provider: "linkedin" } };
      const status: SysStatus = days !== null && days < 10 ? "warn" : "ok";
      return { status, detail: days !== null ? `Active · ${days}d left` : "Active", expiresAt, action: status === "warn" ? { type: "reconnect", label: "Reconnect early", provider: "linkedin" } : undefined };
    },
    (err) => ({ detail: `Introspect failed: ${err.slice(0, 80)}`, action: { type: "reconnect", label: "Reconnect", provider: "linkedin" } }),
  );
}

async function probeAirtable(): Promise<SystemResult> {
  return probe(
    { key: "airtable", name: "Airtable", category: "Data" },
    async () => airtableList(CRM_TABLE, { fields: ["Full Name"], maxRecords: 1, pageSize: 1 }),
    (val) => ({ status: "ok", detail: `Sales Hub reachable · ${(val as unknown[]).length ? "records present" : "empty"}` }),
    (err) => ({ detail: `Failed: ${err.slice(0, 80)}`, action: { type: "add-key", label: "Check Airtable key" } }),
  );
}

async function probeSendPulse(): Promise<SystemResult> {
  const meta = { key: "sendpulse", name: "SendPulse", category: "Messaging" };
  if (!has(process.env.SENDPULSE_CLIENT_ID) || !has(process.env.SENDPULSE_CLIENT_SECRET)) return { ...meta, status: "error", detail: "Credentials missing", expiresAt: null, latencyMs: null, action: { type: "add-key", label: "Add credentials" } };
  return probe(
    meta,
    async () => { const p = await sendpulsePing(); if (!p.ok) throw new Error("auth failed"); return p; },
    (val) => { const p = val as { bots: number }; return { status: "ok", detail: `${p.bots} bot${p.bots === 1 ? "" : "s"}` }; },
    (err) => ({ detail: `Auth failed: ${err.slice(0, 60)}`, action: { type: "add-key", label: "Check credentials" } }),
  );
}

// Key-presence checks (no live call — a ping would cost money/credits).
function probePerplexity(): SystemResult {
  return keyCheck("perplexity", "Perplexity", "AI", has(process.env.PERPLEXITY_API_KEY), "Key set · sonar", "API key missing", "error", { type: "add-key", label: "Add key" });
}
function probeSerper(): SystemResult {
  if (!has(process.env.SERPER_API_KEY)) return { key: "serper", name: "Serper (web search)", category: "Scraping", status: "warn", detail: "No key — Content Radar lanes run best-effort", expiresAt: null, latencyMs: null, action: { type: "add-key", label: "Add key" } };
  const used = callsAllTime("Serper");
  return { key: "serper", name: "Serper (web search)", category: "Scraping", status: "ok", detail: `Key set · ${used.toLocaleString("en-IN")} / 2,500 free credits used`, expiresAt: null, latencyMs: null };
}
function probeReddit(): SystemResult {
  const set = has(process.env.REDDIT_CLIENT_ID) && has(process.env.REDDIT_CLIENT_SECRET);
  return { key: "reddit", name: "Reddit (thread reader)", category: "Social", status: set ? "ok" : "warn", detail: set ? "App configured · full threads" : "Dormant — no app (snippet fallback works)", expiresAt: null, latencyMs: null };
}
function probeApify(): SystemResult {
  return keyCheck("apify", "Apify", "Scraping", has(process.env.APIFY_API_TOKEN), "Token set", "API token missing", "error", { type: "add-key", label: "Add token" });
}
function probeHiker(): SystemResult {
  return keyCheck("hikerapi", "HikerAPI", "Scraping", has(process.env.HIKERAPI_KEY), "Key set", "API key missing", "error", { type: "add-key", label: "Add key" });
}

// ---------- host health ----------
function hostHealth() {
  const mem = process.memoryUsage();
  const mb = (b: number) => Math.round(b / 1_048_576);
  let load1: number | null = null;
  try { load1 = os.loadavg()[0]; } catch { /* windows returns 0 */ }
  return {
    rssMB: mb(mem.rss),
    heapUsedMB: mb(mem.heapUsed),
    heapTotalMB: mb(mem.heapTotal),
    sysTotalMB: mb(os.totalmem()),
    sysFreeMB: mb(os.freemem()),
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpuLoad1: load1 && load1 > 0 ? Math.round(load1 * 100) / 100 : null,
  };
}

// ---------- orchestration ----------
export async function runDiagnostics(trigger: "manual" | "cron"): Promise<DiagnosticsReport> {
  const t0 = Date.now();
  const [supabase, meta, youtube, linkedin, airtable, sendpulse] = await Promise.all([
    probeSupabase(), probeMeta(), probeYouTube(), probeLinkedIn(), probeAirtable(), probeSendPulse(),
  ]);
  const systems: SystemResult[] = [supabase, meta, youtube, linkedin, airtable, sendpulse, probePerplexity(), probeSerper(), probeReddit(), probeApify(), probeHiker()];

  const summary = {
    checked: systems.length,
    healthy: systems.filter((s) => s.status === "ok").length,
    warn: systems.filter((s) => s.status === "warn").length,
    error: systems.filter((s) => s.status === "error").length,
    repaired: systems.filter((s) => s.repair?.result === "fixed").length,
    needsYou: systems.filter((s) => s.status === "error").length,
  };
  const repairs = systems.filter((s) => s.repair).map((s) => ({ system: s.name, action: s.repair!.action, result: s.repair!.result, note: s.repair!.note }));
  const host = hostHealth();
  const report: DiagnosticsReport = { ranAt: Date.now(), trigger, summary, systems, repairs, host, durationMs: Date.now() - t0 };

  try {
    const s = getSupabase();
    if (s) await s.from("mh_diagnostics_runs").insert({ trigger, summary, systems, repairs, host, duration_ms: report.durationMs });
  } catch { /* storage is best-effort — never fail the run */ }
  return report;
}

export async function diagnosticsHistory(limit = 30) {
  const s = getSupabase();
  if (!s) return [];
  try {
    const { data } = await s.from("mh_diagnostics_runs").select("id, ran_at, trigger, summary, duration_ms").order("ran_at", { ascending: false }).limit(limit);
    return data || [];
  } catch {
    return [];
  }
}

export async function diagnosticsRun(id: string) {
  const s = getSupabase();
  if (!s) return null;
  const { data } = await s.from("mh_diagnostics_runs").select("*").eq("id", id).maybeSingle();
  return data;
}
