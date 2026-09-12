import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { airtableList, dateRangeFormula, pickName, pickNumber, idleDays, CRM_TABLE, inActiveRefreshWindow } from "@/lib/sales-hub";

// GET /api/leads-crm/counsellor?name=Robin%20Johnson%20J&from=YYYY-MM-DD&to=YYYY-MM-DD
//   name = a counsellor's display name → only that counsellor's leads
//   name = "all" (or omitted) → every lead in the range (Sales Hub leads table)
//
// Returns individual leads in the date range, each with a derived first-contact
// signal. Read-only, 12h cache per {name|from|to}.
//
// "Contacted" = the lead has been actioned at least once — the earliest of:
//   • Lead Status moved off "New",  • a Note was added,  • Call Attempts >= 1.
// "firstContactHrs" (created → first contact, in hours) is APPROXIMATE for now:
// it reads the frozen first-touch we snapshot daily (mh_lead_first_touch); if that
// isn't frozen yet it falls back to (Actual Last Modified − Created). It becomes
// exact once the Airtable "First Contacted At" automation is added.

type LeadRow = {
  id: string;
  name: string;
  mobile: string;
  source: string;
  status: string;
  interest: string;
  campaign: string;
  createdAt: string;
  lastActivityAt: string;
  daysUntouched: number;
  linkToRecord: string;
  counsellor: string;
  callAttempts: number;
  contacted: boolean;
  firstContactHrs: number | null; // created → first contact, hours (approx)
};

type Payload = {
  counsellor: string;
  range: { from: string; to: string };
  total: number;
  leads: LeadRow[];
  cached?: boolean;
};

const CACHE = new Map<string, { at: number; payload: Payload }>();
// ~2h freshness during working hours; snapshot served as-is overnight (see the
// inActiveRefreshWindow gate below), so no Airtable reads happen 00:00–06:00 IST.
const TTL_MS = 2 * 60 * 60 * 1000;

const CRM_FIELDS = [
  "Full Name",
  "Mobile Number",
  "Created Date",
  "Actual Last Modified",
  "Counsellor",
  "Lead Source (n8n)",
  "Lead Status",
  "Primary Interest (n8n)",
  "Campaign Name",
  "Days Untouched",
  "Link to Record",
  "Notes",          // first-contact signal
  "Call Attempts",  // first-contact signal (rating field, 0-5)
];

// A lead counts as "contacted" once any of the three signals fires.
function isContacted(status: string, callAttempts: number, notes: string): boolean {
  const s = (status || "").trim();
  if (callAttempts >= 1) return true;
  if (notes && notes.trim().length > 0) return true;
  return !!s && s.toLowerCase() !== "new" && s !== "—";
}

export async function GET(req: Request) {
  // Same sales-lead PII (names + mobile numbers) as the parent /api/leads-crm —
  // gate behind the "sales" section so the UI's tab-access can't be bypassed.
  const denied = await requireSection("sales");
  if (denied) return denied;

  const url = new URL(req.url);
  const nameParam = url.searchParams.get("name") || "";
  const wantAll = !nameParam || nameParam.toLowerCase() === "all";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const force = url.searchParams.get("force") === "1";
  if (!from || !to) {
    return NextResponse.json({ error: "from, to required" }, { status: 400 });
  }

  const cacheKey = `${wantAll ? "all" : nameParam}|${from}|${to}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  const fresh = cached && now - cached.at < TTL_MS;
  // Serve the snapshot without hitting Airtable when fresh, or overnight
  // (00:00–06:00 IST) when we already have one. force=1 always refetches.
  if (!force && cached && (fresh || !inActiveRefreshWindow())) {
    return NextResponse.json({ ...cached.payload, cached: true });
  }

  try {
    // Airtable doesn't let us filter singleCollaborator by display name directly
    // in a formula reliably, so we fetch the date-scoped set and filter in JS.
    // For a 30-day window this is < 3k rows — well within budget.
    const leads = await airtableList<Record<string, unknown>>(CRM_TABLE, {
      filterByFormula: dateRangeFormula("Created Date", from, to),
      fields: CRM_FIELDS,
      pageSize: 100,
      maxRecords: 20_000,
    });

    const matched: LeadRow[] = [];
    for (const rec of leads) {
      const f = rec.fields;
      const counsellor = pickName(f["Counsellor"]);
      if (!wantAll && counsellor !== nameParam) continue;
      const status = pickName(f["Lead Status"]);
      const callAttempts = pickNumber(f["Call Attempts"]);
      const notes = pickName(f["Notes"]);
      matched.push({
        id: rec.id,
        name: pickName(f["Full Name"]),
        mobile: pickName(f["Mobile Number"]),
        source: pickName(f["Lead Source (n8n)"]),
        status,
        interest: pickName(f["Primary Interest (n8n)"]),
        campaign: pickName(f["Campaign Name"]),
        createdAt: pickName(f["Created Date"]),
        lastActivityAt: pickName(f["Actual Last Modified"]),
        daysUntouched: idleDays(f),
        linkToRecord: pickName(f["Link to Record"]),
        counsellor: counsellor || "Unassigned",
        callAttempts,
        contacted: isContacted(status, callAttempts, notes),
        firstContactHrs: null, // filled from the frozen first-touch below
      });
    }

    // Approximate first-contact time: read the frozen first-touch snapshot
    // (mh_lead_first_touch, populated daily by /api/leads-crm) for these leads.
    const sb = getSupabase();
    if (sb && matched.length) {
      try {
        const frozen = new Map<string, number>();
        const ids = matched.map((l) => l.id);
        for (let i = 0; i < ids.length; i += 500) {
          const { data } = await sb
            .from("mh_lead_first_touch")
            .select("lead_id, first_touch_at")
            .in("lead_id", ids.slice(i, i + 500));
          for (const row of data || []) {
            if (row.first_touch_at) frozen.set(row.lead_id as string, new Date(row.first_touch_at as string).getTime());
          }
        }
        for (const l of matched) {
          if (!l.contacted || !l.createdAt) continue;
          const created = new Date(l.createdAt).getTime();
          // Prefer the frozen first-touch; fall back to the live last-modified so a
          // contacted lead still shows a (rough) number before the daily freeze runs.
          const touch = frozen.get(l.id) ?? (l.lastActivityAt ? new Date(l.lastActivityAt).getTime() : NaN);
          const gap = touch - created;
          if (Number.isFinite(gap) && gap > 0) l.firstContactHrs = +(gap / 3_600_000).toFixed(1);
        }
      } catch { /* freeze read is best-effort — never fail the whole list on it */ }
    }

    matched.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const payload: Payload = {
      counsellor: wantAll ? "all" : nameParam,
      range: { from, to },
      total: matched.length,
      leads: matched,
    };
    CACHE.set(cacheKey, { at: now, payload });
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Counsellor drilldown failed"), { status: 502 });
  }
}
