// API-call counter with local persistence.
//
// Each provider's central request helper calls recordApiCall(). We keep three
// views:
//   • session  — since this server process started (in-memory)
//   • today    — calls made on the current date
//   • allTime  — running total that survives restarts
//
// allTime/today are persisted to a small JSON file (.data/api-usage.json) so the
// "number of times the API was called" keeps accumulating across restarts. On a
// read-only filesystem (e.g. serverless) the file write silently no-ops and we
// fall back to in-memory only. Counts what THIS dashboard calls — not n8n/others.

import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), ".data", "api-usage.json");

type Counter = { calls: number; errors: number };
type SessionStat = { calls: number; errors: number; lastAt: number | null; lastStatus: number | null };
type Persist = { firstAt: number; allTime: Record<string, Counter>; daily: Record<string, Record<string, Counter>> };

const SESSION = new Map<string, SessionStat>();
const SESSION_START = Date.now();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): Persist {
  try {
    const p = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { firstAt: p.firstAt || Date.now(), allTime: p.allTime || {}, daily: p.daily || {} };
  } catch {
    return { firstAt: Date.now(), allTime: {}, daily: {} };
  }
}

const store: Persist = load();

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (dirty) doSave();
  }, 3000);
}
function doSave() {
  dirty = false;
  try {
    // Keep the daily map bounded (last 30 days).
    const keep = Object.keys(store.daily).sort().slice(-30);
    const daily: Persist["daily"] = {};
    for (const k of keep) daily[k] = store.daily[k];
    store.daily = daily;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store));
  } catch {
    /* read-only fs — in-memory only */
  }
}

export function recordApiCall(provider: string, ok = true, status?: number): void {
  const s = SESSION.get(provider) || { calls: 0, errors: 0, lastAt: null, lastStatus: null };
  s.calls += 1;
  if (!ok) s.errors += 1;
  s.lastAt = Date.now();
  if (typeof status === "number") s.lastStatus = status;
  SESSION.set(provider, s);

  const at = store.allTime[provider] || { calls: 0, errors: 0 };
  at.calls += 1;
  if (!ok) at.errors += 1;
  store.allTime[provider] = at;

  const d = today();
  store.daily[d] = store.daily[d] || {};
  const dc = store.daily[d][provider] || { calls: 0, errors: 0 };
  dc.calls += 1;
  if (!ok) dc.errors += 1;
  store.daily[d][provider] = dc;

  scheduleSave();
}

// Credits/calls a provider has spent in the current calendar month (YYYY-MM) —
// used to enforce a self-imposed budget (e.g. Serper's one-time free credits).
// Note: the daily map keeps the last 30 days, so very early-month days can age
// out near month-end; that only ever UNDERcounts, which is the safe direction.
export function callsThisMonth(provider: string): number {
  const ym = today().slice(0, 7);
  let n = 0;
  for (const [date, day] of Object.entries(store.daily)) {
    if (date.startsWith(ym)) n += day[provider]?.calls || 0;
  }
  return n;
}
// Running total a provider has spent since counting began (survives restarts).
export function callsAllTime(provider: string): number {
  return store.allTime[provider]?.calls || 0;
}

export type UsageRow = {
  provider: string;
  calls: number; // session
  errors: number; // session
  lastAt: number | null;
  lastStatus: number | null;
  today: number; // calls today
  allTime: number; // calls all-time
  allTimeErrors: number;
};

export function usageSnapshot() {
  const d = today();
  const providers = new Set<string>([...SESSION.keys(), ...Object.keys(store.allTime)]);
  const rows: UsageRow[] = [...providers].map((p) => {
    const s = SESSION.get(p);
    return {
      provider: p,
      calls: s?.calls || 0,
      errors: s?.errors || 0,
      lastAt: s?.lastAt || null,
      lastStatus: s?.lastStatus || null,
      today: store.daily[d]?.[p]?.calls || 0,
      allTime: store.allTime[p]?.calls || 0,
      allTimeErrors: store.allTime[p]?.errors || 0,
    };
  });
  rows.sort((a, b) => b.allTime - a.allTime || b.calls - a.calls);
  return {
    startedAt: SESSION_START,
    firstAt: store.firstAt,
    rows,
    totalSession: rows.reduce((n, r) => n + r.calls, 0),
    totalToday: rows.reduce((n, r) => n + r.today, 0),
    totalAllTime: rows.reduce((n, r) => n + r.allTime, 0),
    totalErrors: rows.reduce((n, r) => n + r.errors, 0),
  };
}
