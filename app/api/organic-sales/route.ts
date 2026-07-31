import { NextResponse } from "next/server";
import { organicSales } from "@/lib/organic-sales";
import { safeError } from "@/lib/errors";

// GET /api/organic-sales?from=YYYY-MM-DD&to=YYYY-MM-DD
// Paid E-Book orders from the Airtable Marketing Hub base, aggregated by book,
// payment mode and month for the Organic Sales tab. Defaults to the last 30 days.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const today = new Date().toISOString().slice(0, 10);
    const to = url.searchParams.get("to") || today;
    const from = url.searchParams.get("from") || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const report = await organicSales(from, to);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load organic sales"), { status: 502 });
  }
}
