// Long-term Website history — Clarity and Bing only expose a tiny live window
// (Clarity: last ~3 days; Bing: its own rolling window). We snapshot one day at
// a time into Supabase `discover_cache` so the 7/30/90-day toggle can read
// accumulated history, exactly like the Instagram Stories/account snapshots.
//
// Bing's overTime is ALREADY per-day, so one snapshot backfills its whole window
// at once. Clarity only gives an aggregate for the last N days, so we snapshot
// numOfDays=1 daily and it builds forward from the day we switch this on.
import { getSupabase } from "@/lib/supabase";
import { buildClarity, hasClarityAuth } from "@/lib/clarity";
import { buildBing, hasBingAuth } from "@/lib/bing";

const CK_CLARITY = (date: string) => `web_clarity_daily:${date}`;
const CK_BING = (date: string) => `web_bing_daily:${date}`;
const CK_BING_LATEST = "web_bing_latest";

type Sig = { name: string; count: number; sessionsPct: number };
type ClarityDay = {
  date: string;
  sessions: number; botSessions: number; distinctUsers: number; pagesPerSession: number;
  scrollDepth: number; totalTimeSec: number; activeTimeSec: number; signals: Sig[];
};
type BingDay = { date: string; clicks: number; impressions: number };

// ---------------- Clarity ----------------
export async function snapshotClarityForDay(date: string): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: "Supabase not configured" };
  if (!hasClarityAuth()) return { ok: false, error: "Clarity not configured" };
  try {
    const c = await buildClarity(1); // last 1 day = this day's slice
    const row: ClarityDay = {
      date,
      sessions: c.traffic.sessions, botSessions: c.traffic.botSessions,
      distinctUsers: c.traffic.distinctUsers, pagesPerSession: c.traffic.pagesPerSession,
      scrollDepth: c.scrollDepth, totalTimeSec: c.engagement.totalTimeSec, activeTimeSec: c.engagement.activeTimeSec,
      signals: c.signals.map((s) => ({ name: s.name, count: s.count, sessionsPct: s.sessionsPct })),
    };
    const { error } = await db.from("discover_cache").upsert(
      { cache_key: CK_CLARITY(date), source: "web_clarity_daily", last_fetched: new Date().toISOString(), payload: row },
      { onConflict: "cache_key" },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function readClarityHistory(from: string, to: string) {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("discover_cache").select("payload").eq("source", "web_clarity_daily");
  const days = (data || []).map((r) => r.payload as ClarityDay)
    .filter((d) => d && d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return null;
  const sum = (f: (d: ClarityDay) => number) => days.reduce((s, d) => s + f(d), 0);
  const sessions = sum((d) => d.sessions);
  const wavg = (f: (d: ClarityDay) => number) => (sessions ? days.reduce((s, d) => s + f(d) * d.sessions, 0) / sessions : 0);
  const sig = new Map<string, { count: number; pctW: number }>();
  for (const d of days) for (const s of d.signals) {
    const m = sig.get(s.name) || { count: 0, pctW: 0 };
    m.count += s.count; m.pctW += s.sessionsPct * d.sessions; sig.set(s.name, m);
  }
  return {
    days: days.length, from, to,
    traffic: { sessions, botSessions: sum((d) => d.botSessions), distinctUsers: sum((d) => d.distinctUsers), pagesPerSession: +wavg((d) => d.pagesPerSession).toFixed(1) },
    scrollDepth: +wavg((d) => d.scrollDepth).toFixed(1),
    engagement: { totalTimeSec: sum((d) => d.totalTimeSec), activeTimeSec: sum((d) => d.activeTimeSec) },
    signals: [...sig.entries()].map(([name, m]) => ({ name, count: m.count, sessionsPct: sessions ? +(m.pctW / sessions).toFixed(1) : 0 })),
    overTime: days.map((d) => ({ date: d.date, sessions: d.sessions })),
  };
}

// ---------------- Bing ----------------
export async function snapshotBingForDay(_date: string): Promise<{ ok: boolean; error?: string; daysStored?: number }> {
  const db = getSupabase();
  if (!db) return { ok: false, error: "Supabase not configured" };
  if (!hasBingAuth()) return { ok: false, error: "Bing not configured" };
  try {
    const b = await buildBing();
    // Bing returns per-day rows — upsert each so history survives Bing trimming its window.
    const rows = (b.overTime || []).filter((r) => r.date).map((r) => ({
      cache_key: CK_BING(r.date), source: "web_bing_daily", last_fetched: new Date().toISOString(),
      payload: { date: r.date, clicks: r.clicks, impressions: r.impressions } as BingDay,
    }));
    if (rows.length) { const { error } = await db.from("discover_cache").upsert(rows, { onConflict: "cache_key" }); if (error) return { ok: false, error: error.message }; }
    // Latest queries/pages/summary snapshot (aggregate — Bing's own window).
    await db.from("discover_cache").upsert(
      { cache_key: CK_BING_LATEST, source: "web_bing_latest", last_fetched: new Date().toISOString(), payload: { queries: b.queries, pages: b.pages, summary: b.summary } },
      { onConflict: "cache_key" },
    );
    return { ok: true, daysStored: rows.length };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function readBingHistory(from: string, to: string) {
  const db = getSupabase();
  if (!db) return null;
  const [daily, latest] = await Promise.all([
    db.from("discover_cache").select("payload").eq("source", "web_bing_daily"),
    db.from("discover_cache").select("payload").eq("cache_key", CK_BING_LATEST).limit(1),
  ]);
  const overTime = (daily.data || []).map((r) => r.payload as BingDay)
    .filter((d) => d && d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!overTime.length) return null;
  const clicks = overTime.reduce((s, r) => s + r.clicks, 0);
  const impressions = overTime.reduce((s, r) => s + r.impressions, 0);
  const l = (latest.data?.[0]?.payload || {}) as { queries?: unknown[]; pages?: unknown[]; summary?: { avgPosition?: number } };
  return {
    days: overTime.length, from, to, overTime,
    summary: { clicks, impressions, ctr: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0, avgPosition: l.summary?.avgPosition ?? 0 },
    queries: l.queries || [], pages: l.pages || [],
  };
}
