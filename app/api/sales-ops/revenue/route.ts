import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { revenueReport } from "@/lib/revenue";

// GET /api/sales-ops/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD[&fresh=1] → programme revenue
// from the Sales Hub Revenue Tracker (lib/revenue.ts). Same access as the Sales Hub.
export const dynamic = "force-dynamic";
const ymd = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const u = new URL(req.url);
    const to = ymd(u.searchParams.get("to")) || new Date().toISOString().slice(0, 10);
    const from = ymd(u.searchParams.get("from")) || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    return NextResponse.json(await revenueReport(from, to, u.searchParams.get("fresh") === "1"));
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load revenue"), { status: 502 });
  }
}
