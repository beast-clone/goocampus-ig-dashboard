import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";

// System → Workflows.
//
// The dashboard's scheduled work does not run inside the dashboard. Next.js routes
// cannot put themselves on a timer, so every recurring job is an n8n workflow that
// calls an /api/cron/* endpoint on a schedule. Until this page existed there was no
// way to see them from here: you had to open n8n, and so nobody did — which is how
// the Airtable import sat switched off without anyone noticing.
//
// Read-only. Nothing here starts, stops or edits a workflow; it reports.
export const dynamic = "force-dynamic";

const BASE = (process.env.N8N_BASE_URL || "https://n8n.srv1046538.hstgr.cloud").replace(/\/$/, "");
const KEY = process.env.N8N_API_KEY;

// Which workflows are "ours": the ones whose nodes call one of this dashboard's
// cron endpoints. Derived rather than hardcoded, so a workflow added later shows up
// here on its own instead of needing this file edited.
const OURS = /\/api\/cron\//;

type N8nNode = { type?: string; parameters?: Record<string, unknown> };
type N8nWorkflow = { id: string; name: string; active: boolean; nodes?: N8nNode[]; settings?: { timezone?: string } };
type N8nExecution = { id: string; workflowId: string; status: string; startedAt: string; stoppedAt: string | null };

// The schedule trigger stores a rule object; turn it into something readable.
function describeSchedule(nodes: N8nNode[] | undefined): string | null {
  const trig = (nodes || []).find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
  const rule = trig?.parameters?.rule as { interval?: Record<string, unknown>[] } | undefined;
  const iv = rule?.interval?.[0];
  if (!iv) return null;
  const n = (k: string) => (typeof iv[k] === "number" ? (iv[k] as number) : undefined);
  const pad = (v: number) => String(v).padStart(2, "0");
  switch (iv.field) {
    case "minutes": return `every ${n("minutesInterval") ?? 1} min`;
    case "hours": {
      const every = n("hoursInterval") ?? 1;
      const at = n("triggerAtMinute");
      return every === 1 ? (at ? `hourly at :${pad(at)}` : "hourly") : `every ${every} hours`;
    }
    case "days": return `daily ${pad(n("triggerAtHour") ?? 0)}:${pad(n("triggerAtMinute") ?? 0)}`;
    case "weeks": return "weekly";
    case "cronExpression": return String(iv.expression ?? "cron");
    default: return String(iv.field ?? "custom");
  }
}

// The /api/cron/* path a workflow pokes, so the page can say what it actually does.
function describeEndpoint(nodes: N8nNode[] | undefined): string | null {
  for (const node of nodes || []) {
    const url = node.parameters?.url;
    if (typeof url === "string" && OURS.test(url)) {
      try { return new URL(url).pathname; } catch { return url; }
    }
  }
  return null;
}

async function n8n(path: string) {
  const res = await fetch(`${BASE}/api/v1/${path}`, {
    headers: { "X-N8N-API-KEY": KEY as string, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`n8n ${path} → ${res.status}`);
  return res.json();
}

export async function GET() {
  const denied = await requireSection("system");
  if (denied) return denied;

  if (!KEY) {
    return NextResponse.json({
      connected: false,
      baseUrl: BASE,
      needsKey: true,
      error: "N8N_API_KEY is not set, so the live status cannot be read.",
      workflows: [],
    });
  }

  try {
    // Two calls, not one per workflow: pull every execution once and group in memory.
    const [wfRes, exRes] = await Promise.all([
      n8n("workflows?limit=250"),
      n8n("executions?limit=250&includeData=false"),
    ]);

    const all: N8nWorkflow[] = wfRes?.data ?? [];
    const execs: N8nExecution[] = exRes?.data ?? [];

    // Newest run per workflow. The list arrives newest-first, so the first one wins.
    const latest = new Map<string, N8nExecution>();
    for (const e of execs) if (!latest.has(e.workflowId)) latest.set(e.workflowId, e);

    const workflows = all
      .filter((w) => OURS.test(JSON.stringify(w.nodes ?? [])))
      .map((w) => {
        const last = latest.get(w.id);
        return {
          id: w.id,
          name: w.name,
          active: !!w.active,
          schedule: describeSchedule(w.nodes),
          endpoint: describeEndpoint(w.nodes),
          timezone: w.settings?.timezone ?? null,
          url: `${BASE}/workflow/${w.id}`,
          lastRun: last
            ? {
                status: last.status,
                startedAt: last.startedAt,
                ms: last.stoppedAt ? Date.parse(last.stoppedAt) - Date.parse(last.startedAt) : null,
              }
            : null,
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

    return NextResponse.json({ connected: true, baseUrl: BASE, checkedAt: new Date().toISOString(), workflows });
  } catch (err) {
    return NextResponse.json(
      { connected: false, baseUrl: BASE, workflows: [], ...safeError(err, "Could not reach n8n") },
      { status: 502 },
    );
  }
}
