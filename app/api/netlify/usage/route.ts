import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";

// Diagnostics → "Netlify usage".
//
// On 2 October 2026 a single Netlify Scheduled Function (competitor-watch) was
// timing out on every run, every five minutes, burning the full 30 seconds and
// retrying three times. It ate most of a 3,000-credit month before anyone
// noticed, because nothing in the dashboard ever showed what the dashboard was
// costing. This endpoint is the answer to that: it says, in plain numbers, how
// much scheduled work is pointed at this site and roughly what it costs a day.
//
// Everything here is DERIVED, not guessed. The run counts come from the live n8n
// schedules and the durations from those workflows' real execution history, so
// the figure moves when the schedules move. It is still an estimate — Netlify
// bills on its own meters, not ours — and the page says so.
export const dynamic = "force-dynamic";

const BASE = (process.env.N8N_BASE_URL || "https://n8n.srv1046538.hstgr.cloud").replace(/\/$/, "");
const KEY = process.env.N8N_API_KEY;
const OURS = /\/api\/cron\//;

// The overnight stop zone, mirrored from lib/quiet-hours.ts.
const QUIET_FROM = 0, QUIET_TO = 6;

type Node = { type?: string; parameters?: Record<string, unknown> };
type Wf = { id: string; name: string; active: boolean; nodes?: Node[] };
type Ex = { workflowId: string; startedAt: string; stoppedAt: string | null };

/** How many times a day this trigger fires, and how many of those land in the stop zone. */
function runsPerDay(nodes: Node[] | undefined): { total: number; inQuiet: number } {
  const trig = (nodes || []).find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
  const iv = (trig?.parameters?.rule as { interval?: Record<string, unknown>[] } | undefined)?.interval?.[0];
  if (!iv) return { total: 0, inQuiet: 0 };
  const num = (k: string) => (typeof iv[k] === "number" ? (iv[k] as number) : undefined);
  const quiet = (h: number) => h >= QUIET_FROM && h < QUIET_TO;

  switch (iv.field) {
    case "minutes": {
      const per = 60 / (num("minutesInterval") || 1);
      return { total: Math.round(per * 24), inQuiet: Math.round(per * (QUIET_TO - QUIET_FROM)) };
    }
    case "hours": {
      const every = num("hoursInterval") || 1;
      const hours: number[] = [];
      for (let h = 0; h < 24; h += every) hours.push(h);
      return { total: hours.length, inQuiet: hours.filter(quiet).length };
    }
    case "days": {
      const h = num("triggerAtHour") ?? 0;
      return { total: 1, inQuiet: quiet(h) ? 1 : 0 };
    }
    case "cronExpression": {
      // Only the shape we actually use: "<minutes> <hours> * * *", where each
      // field is a list of values or ranges. Anything stranger returns 0 rather
      // than a number we cannot stand behind.
      const expr = String(iv.expression ?? "");
      const parts = expr.trim().split(/\s+/);
      if (parts.length < 5) return { total: 0, inQuiet: 0 };
      const expand = (f: string, max: number): number[] => {
        if (f === "*") return Array.from({ length: max }, (_, i) => i);
        const out: number[] = [];
        for (const chunk of f.split(",")) {
          const m = chunk.match(/^(\d+)-(\d+)$/);
          if (m) { for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i); }
          else if (/^\d+$/.test(chunk)) out.push(Number(chunk));
          else return [];
        }
        return out;
      };
      const mins = expand(parts[0], 60), hrs = expand(parts[1], 24);
      if (!mins.length || !hrs.length) return { total: 0, inQuiet: 0 };
      return { total: mins.length * hrs.length, inQuiet: mins.length * hrs.filter(quiet).length };
    }
    default: return { total: 0, inQuiet: 0 };
  }
}

function endpointOf(nodes: Node[] | undefined): string | null {
  for (const n of nodes || []) {
    const url = n.parameters?.url;
    if (typeof url === "string" && OURS.test(url)) {
      try { return new URL(url).pathname; } catch { return url; }
    }
  }
  return null;
}

export async function GET() {
  const denied = await requireSection("system");
  if (denied) return denied;

  if (!KEY) {
    return NextResponse.json({ connected: false, needsKey: true, jobs: [], totals: null });
  }

  try {
    const call = async (p: string) => {
      const r = await fetch(`${BASE}/api/v1/${p}`, { headers: { "X-N8N-API-KEY": KEY }, cache: "no-store" });
      if (!r.ok) throw new Error(`n8n ${p} → ${r.status}`);
      return r.json();
    };
    // n8n pages at 250 and this account is over that, so follow the cursor —
    // otherwise a newly created job is missing from the totals.
    const allWorkflows = async () => {
      const out: Wf[] = [];
      let cursor: string | undefined;
      do {
        const page = await call(`workflows?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        out.push(...((page?.data ?? []) as Wf[]));
        cursor = page?.nextCursor || undefined;
      } while (cursor && out.length < 2000);
      return out;
    };
    const [wfAll, exRes] = await Promise.all([
      allWorkflows(),
      call("executions?limit=250&includeData=false"),
    ]);

    // Average measured duration per workflow, from real runs.
    const durs = new Map<string, number[]>();
    for (const e of (exRes?.data ?? []) as Ex[]) {
      if (!e.stoppedAt) continue;
      const ms = Date.parse(e.stoppedAt) - Date.parse(e.startedAt);
      if (ms <= 0 || ms > 300_000) continue;
      const list = durs.get(e.workflowId) || [];
      list.push(ms);
      durs.set(e.workflowId, list);
    }
    const avg = (id: string) => {
      const a = durs.get(id);
      return a?.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
    };

    const jobs = wfAll
      .filter((w) => OURS.test(JSON.stringify(w.nodes ?? [])))
      .map((w) => {
        const { total, inQuiet } = runsPerDay(w.nodes);
        const ms = avg(w.id);
        return {
          id: w.id, name: w.name, active: !!w.active, endpoint: endpointOf(w.nodes),
          runsPerDay: w.active ? total : 0,
          runsInQuietHours: w.active ? inQuiet : 0,
          avgMs: ms,
          secondsPerDay: w.active && ms != null ? Math.round((total * ms) / 1000) : null,
        };
      })
      .sort((a, b) => (b.secondsPerDay ?? 0) - (a.secondsPerDay ?? 0));

    const live = jobs.filter((j) => j.active);
    const totals = {
      jobs: live.length,
      callsPerDay: live.reduce((n, j) => n + j.runsPerDay, 0),
      callsInQuietHours: live.reduce((n, j) => n + j.runsInQuietHours, 0),
      secondsPerDay: live.reduce((n, j) => n + (j.secondsPerDay ?? 0), 0),
      measured: live.filter((j) => j.avgMs != null).length,
    };

    return NextResponse.json({
      connected: true,
      checkedAt: new Date().toISOString(),
      quietHours: { from: QUIET_FROM, to: QUIET_TO },
      // Nothing on Netlify itself is on a timer any more — the scheduled
      // functions were all removed on 2 October. If this ever stops being true,
      // netlify/functions will have a .mts file in it again.
      netlifyScheduledFunctions: 0,
      jobs, totals,
    });
  } catch (err) {
    return NextResponse.json({ connected: false, jobs: [], totals: null, ...safeError(err, "Could not reach n8n") }, { status: 502 });
  }
}
