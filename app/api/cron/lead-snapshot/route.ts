import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { snapshotActiveLeads } from "@/lib/lead-snapshot";

// Daily cron. Records today's status of every ACTIVE lead into Supabase so the
// Sales Hub tracker can show how a lead moved over time (Airtable keeps only the
// current value).
//
//   GET /api/cron/lead-snapshot                 → snapshot TODAY
//   GET /api/cron/lead-snapshot?date=2026-08-19 → snapshot as a specific day
//
// Auth: header `x-cron-secret: <CRON_SECRET>`. Header-only — a query-string
// secret leaks into proxy, CDN and browser-history logs.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const url = new URL(req.url);
  const explicit = url.searchParams.get("date");
  if (explicit && !/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const day = explicit || new Date().toISOString().slice(0, 10);

  const t0 = Date.now();
  try {
    const result = await snapshotActiveLeads(day);
    return NextResponse.json({ ...result, date: day, ms: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json(safeError(err, "Lead snapshot failed"), { status: 502 });
  }
}
