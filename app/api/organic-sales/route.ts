import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { organicSales } from "@/lib/organic-sales";
import { safeError } from "@/lib/errors";

// GET /api/organic-sales?from=YYYY-MM-DD&to=YYYY-MM-DD
// Paid E-Book orders from the Airtable Marketing Hub base, aggregated by book,
// payment mode and month for the Organic Sales tab. Defaults to the last 30 days.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const __denied = await requireSection("sales");
  if (__denied) return __denied;

  try {
    const url = new URL(req.url);
    const today = new Date().toISOString().slice(0, 10);
    const to = url.searchParams.get("to") || today;
    const from = url.searchParams.get("from") || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    // ?book=amc | nz  → narrow to one e-book (per-book tab); omit for all.
    const bp = url.searchParams.get("book");
    const book = bp === "amc" ? "AMC E Book" : bp === "nz" ? "New Zealand E Book" : undefined;
    const report = await organicSales(from, to, book);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load organic sales"), { status: 502 });
  }
}
