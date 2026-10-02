import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// System → Workflows.
//
// The dashboard's scheduled work does not run inside the dashboard. Next.js routes
// cannot put themselves on a timer, so every recurring job is an n8n workflow that
// calls an /api/cron/* endpoint on a schedule. Until this page existed there was no
// way to see them from here: you had to open n8n, and so nobody did — which is how
// the Airtable import sat switched off without anyone noticing.
//
// Only the dashboard's own jobs are listed. The n8n account also runs the TezDM
// funnels, the voucher generator, the ops-call summariser and more; none of that
// belongs on this page. Membership is DERIVED — a workflow qualifies by calling an
// /api/cron/* endpoint here — so new ones appear on their own and unrelated ones
// never do. Anything else can be pinned explicitly via mh_tracked_workflows.
//
// Read-only with respect to n8n. Nothing here starts, stops or edits a workflow.
export const dynamic = "force-dynamic";

const BASE = (process.env.N8N_BASE_URL || "https://n8n.srv1046538.hstgr.cloud").replace(/\/$/, "");
const KEY = process.env.N8N_API_KEY;
const OURS = /\/api\/cron\//;

type N8nNode = { type?: string; parameters?: Record<string, unknown> };
type N8nWorkflow = { id: string; name: string; active: boolean; nodes?: N8nNode[]; settings?: { timezone?: string } };
type N8nExecution = { id: string; workflowId: string; status: string; startedAt: string; stoppedAt: string | null };

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

// n8n pages at 250. This account is over that, so a single call silently drops
// whatever sits past the first page — which is exactly where a newly created
// workflow lands. Follow the cursor to the end.
async function n8nAll<T>(path: string, max = 2000): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const page = await n8n(path + (cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : ""));
    out.push(...((page?.data ?? []) as T[]));
    cursor = page?.nextCursor || undefined;
  } while (cursor && out.length < max);
  return out;
}

async function trackedIds(): Promise<Set<string>> {
  const sb = getSupabase();
  if (!sb) return new Set();
  const { data } = await sb.from("mh_tracked_workflows").select("workflow_id");
  return new Set(((data || []) as { workflow_id: string }[]).map((r) => r.workflow_id));
}

export async function GET() {
  const denied = await requireSection("system");
  if (denied) return denied;

  if (!KEY) {
    return NextResponse.json({
      connected: false, baseUrl: BASE, needsKey: true,
      error: "N8N_API_KEY is not set, so the live status cannot be read.",
      workflows: [], others: [],
    });
  }

  try {
    const [all, execs, pinned] = await Promise.all([
      n8nAll<N8nWorkflow>("workflows?limit=250"),
      // One page of executions is plenty — we only want each workflow's newest.
      n8n("executions?limit=250&includeData=false").then((r) => (r?.data ?? []) as N8nExecution[]),
      trackedIds(),
    ]);

    // Newest run per workflow; the list arrives newest-first so the first one wins.
    const latest = new Map<string, N8nExecution>();
    for (const e of execs) if (!latest.has(e.workflowId)) latest.set(e.workflowId, e);

    const belongs = (w: N8nWorkflow) => OURS.test(JSON.stringify(w.nodes ?? [])) || pinned.has(w.id);

    const shape = (w: N8nWorkflow) => {
      const last = latest.get(w.id);
      return {
        id: w.id,
        name: w.name,
        active: !!w.active,
        schedule: describeSchedule(w.nodes),
        endpoint: describeEndpoint(w.nodes),
        timezone: w.settings?.timezone ?? null,
        pinned: pinned.has(w.id) && !OURS.test(JSON.stringify(w.nodes ?? [])),
        url: `${BASE}/workflow/${w.id}`,
        lastRun: last
          ? {
              status: last.status,
              startedAt: last.startedAt,
              ms: last.stoppedAt ? Date.parse(last.stoppedAt) - Date.parse(last.startedAt) : null,
            }
          : null,
      };
    };

    const workflows = all.filter(belongs).map(shape)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

    // Everything else in the account, names only, so the page can offer them in the
    // "track another" picker without ever listing them as if they were ours.
    const others = all.filter((w) => !belongs(w))
      .map((w) => ({ id: w.id, name: w.name, active: !!w.active }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ connected: true, baseUrl: BASE, checkedAt: new Date().toISOString(), workflows, others });
  } catch (err) {
    return NextResponse.json(
      { connected: false, baseUrl: BASE, workflows: [], others: [], ...safeError(err, "Could not reach n8n") },
      { status: 502 },
    );
  }
}

// Pin another workflow to the list. Nothing in n8n changes — this only affects what
// this page shows.
export async function POST(req: Request) {
  const denied = await requireSection("system");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const body = await req.json();
    const id = typeof body?.workflowId === "string" ? body.workflowId.trim() : "";
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 200) : null;
    if (!id) return NextResponse.json({ error: "workflowId is required" }, { status: 400 });

    const { error } = await sb.from("mh_tracked_workflows")
      .upsert({ workflow_id: id, label, added_by: getSessionUserId() }, { onConflict: "workflow_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, workflowId: id });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not track that workflow"), { status: 502 });
  }
}

// Unpin. Only ever removes a manually added one — the dashboard's own jobs are
// derived from their cron calls and cannot be hidden this way.
export async function DELETE(req: Request) {
  const denied = await requireSection("system");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const id = new URL(req.url).searchParams.get("workflowId")?.trim();
    if (!id) return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
    const { error } = await sb.from("mh_tracked_workflows").delete().eq("workflow_id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not untrack that workflow"), { status: 502 });
  }
}
