import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { airtableList, dateRangeFormula, pickName, pickNumber, CRM_TABLE } from "@/lib/sales-hub";

// GET /api/leads-crm/counsellor?name=Robin%20Johnson%20J&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Drilldown: returns individual leads assigned to a specific counsellor in the
// selected date range. Read-only, 12h cache per {name|from|to}.

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
};

type Payload = {
  counsellor: string;
  range: { from: string; to: string };
  total: number;
  leads: LeadRow[];
  cached?: boolean;
};

const CACHE = new Map<string, { at: number; payload: Payload }>();
const TTL_MS = 12 * 60 * 60 * 1000;

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
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const force = url.searchParams.get("force") === "1";
  if (!name || !from || !to) {
    return NextResponse.json({ error: "name, from, to required" }, { status: 400 });
  }

  const cacheKey = `${name}|${from}|${to}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (!force && cached && now - cached.at < TTL_MS) {
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
      if (counsellor !== name) continue;
      matched.push({
        id: rec.id,
        name: pickName(f["Full Name"]),
        mobile: pickName(f["Mobile Number"]),
        source: pickName(f["Lead Source (n8n)"]),
        status: pickName(f["Lead Status"]),
        interest: pickName(f["Primary Interest (n8n)"]),
        campaign: pickName(f["Campaign Name"]),
        createdAt: pickName(f["Created Date"]),
        lastActivityAt: pickName(f["Actual Last Modified"]),
        daysUntouched: pickNumber(f["Days Untouched"]),
        linkToRecord: pickName(f["Link to Record"]),
      });
    }

    matched.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const payload: Payload = {
      counsellor: name,
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
