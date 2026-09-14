import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { airtableList, CRM_TABLE, dateRangeFormula, pickName } from "@/lib/sales-hub";
import { getSbuMap } from "@/lib/lead-assignment";

// Lead-status grids for the monthly report (see docs/MONTHLY_REPORT_SPEC.md):
//   GET /api/reports/lead-status?from=YYYY-MM-DD&to=YYYY-MM-DD
//     → { window, total, byStatus:[{status,count}],
//         statuses:[...], bySbu:[{sbu,total,counts:{status:count}}] }
// Read-only aggregation of leads CREATED in the window, grouped by Lead Status
// and by SBU (Primary Interest → SBU). Defaults to the last 30 days.
export const dynamic = "force-dynamic";

const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const u = new URL(req.url);
    const today = new Date();
    const to = isYMD(u.searchParams.get("to") || "") ? u.searchParams.get("to")! : today.toISOString().slice(0, 10);
    const from = isYMD(u.searchParams.get("from") || "")
      ? u.searchParams.get("from")!
      : new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);

    const [leads, sbuMap] = await Promise.all([
      airtableList<Record<string, unknown>>(CRM_TABLE, {
        filterByFormula: dateRangeFormula("Created Date", from, to),
        fields: ["Lead Status", "Primary Interest (n8n)"],
        pageSize: 100,
        maxRecords: 20_000,
      }),
      getSbuMap(),
    ]);

    const statusCount = new Map<string, number>();
    const sbuMapAgg = new Map<string, { total: number; counts: Map<string, number> }>();
    for (const rec of leads) {
      const status = pickName(rec.fields["Lead Status"]) || "—";
      const interest = pickName(rec.fields["Primary Interest (n8n)"]) || "No primary interest";
      const sbu = sbuMap.get(interest) || "Other";
      statusCount.set(status, (statusCount.get(status) || 0) + 1);
      let s = sbuMapAgg.get(sbu);
      if (!s) { s = { total: 0, counts: new Map() }; sbuMapAgg.set(sbu, s); }
      s.total += 1;
      s.counts.set(status, (s.counts.get(status) || 0) + 1);
    }

    const byStatus = [...statusCount.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
    const statuses = byStatus.map((s) => s.status); // column order = busiest first
    const bySbu = [...sbuMapAgg.entries()]
      .map(([sbu, v]) => ({ sbu, total: v.total, counts: Object.fromEntries(v.counts) as Record<string, number> }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({ window: { from, to }, total: leads.length, byStatus, statuses, bySbu });
  } catch (err) {
    return NextResponse.json(safeError(err, "Lead-status report failed"), { status: 502 });
  }
}
