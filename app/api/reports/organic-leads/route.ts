import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { airtableList, CRM_TABLE, dateRangeFormula, pickName } from "@/lib/sales-hub";

// Total Organic Leads by month, computed from the CRM Lead Source (a CRM-based
// ESTIMATE — the team's own report uses a curated methodology that can differ).
// See docs/MONTHLY_REPORT_SPEC.md.
//   GET /api/reports/organic-leads?from=YYYY-MM-DD&to=YYYY-MM-DD
//     → { estimate:true, rows:[{month:"2026-06", igfb, dmBookings, ytEnquiries,
//         website, inboundCall, total}] }
// Buckets (organic only — paid ads / referrals excluded, so Total = sum of the 5):
export const dynamic = "force-dynamic";
const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function bucketOf(source: string): "igfb" | "dmBookings" | "ytEnquiries" | "website" | "inboundCall" | null {
  const s = source.toLowerCase();
  if (s.includes("instagram") || s.includes("facebook")) return "igfb";
  if (s.includes("dm booking") || s === "bookings") return "dmBookings";
  if (s.includes("youtube")) return "ytEnquiries";
  if (s.includes("website")) return "website";
  if (s.includes("inbound call")) return "inboundCall";
  return null; // paid ads, referrals, misc — not an organic bucket
}

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const u = new URL(req.url);
    const to = isYMD(u.searchParams.get("to") || "") ? u.searchParams.get("to")! : new Date().toISOString().slice(0, 10);
    const from = isYMD(u.searchParams.get("from") || "") ? u.searchParams.get("from")! : "2026-06-01";

    const leads = await airtableList<Record<string, unknown>>(CRM_TABLE, {
      filterByFormula: dateRangeFormula("Created Date", from, to),
      fields: ["Created Date", "Lead Source (n8n)"],
      pageSize: 100,
      maxRecords: 30_000,
    });

    type Row = { month: string; igfb: number; dmBookings: number; ytEnquiries: number; website: number; inboundCall: number; total: number };
    const byMonth = new Map<string, Row>();
    for (const rec of leads) {
      const created = pickName(rec.fields["Created Date"]);
      if (!created) continue;
      const month = created.slice(0, 7); // YYYY-MM
      const b = bucketOf(pickName(rec.fields["Lead Source (n8n)"]) || "");
      if (!b) continue;
      let row = byMonth.get(month);
      if (!row) { row = { month, igfb: 0, dmBookings: 0, ytEnquiries: 0, website: 0, inboundCall: 0, total: 0 }; byMonth.set(month, row); }
      row[b] += 1;
      row.total += 1;
    }
    // Guard against a boundary/timezone leak: only months at/after the requested start.
    const fromMonth = from.slice(0, 7);
    const rows = [...byMonth.values()].filter((r) => r.month >= fromMonth).sort((a, b) => a.month.localeCompare(b.month));
    return NextResponse.json({ estimate: true, rows });
  } catch (err) {
    return NextResponse.json(safeError(err, "Organic-leads report failed"), { status: 502 });
  }
}
