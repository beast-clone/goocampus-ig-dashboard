import { NextResponse } from "next/server";
import { snapshotAllAccountsForDay } from "@/lib/snapshot";

// Daily cron endpoint. Call this once a day (n8n) to record each account's
// metrics into Supabase so we keep history beyond Meta's 30-day cutoff.
//
//   GET  /api/cron/snapshot                            -> snapshots YESTERDAY for all accounts
//   GET  /api/cron/snapshot?date=2026-06-20            -> snapshots a specific day
//   GET  /api/cron/snapshot?backfill=30                -> snapshots the last 30 days (one-time catch-up)
//
// Auth: must include header `x-cron-secret: <CRON_SECRET>` (set in env).

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  // Also accept ?secret= for easy manual testing
  const url = new URL(req.url);
  const qsSecret = url.searchParams.get("secret");
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (headerSecret !== secret && qsSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backfill = parseInt(url.searchParams.get("backfill") || "0", 10);
  const explicit = url.searchParams.get("date");
  const t0 = Date.now();

  // Build the list of dates to snapshot
  const dates: string[] = [];
  if (explicit) {
    dates.push(explicit);
  } else if (backfill > 0) {
    const days = Math.min(backfill, 60);
    for (let i = days; i >= 1; i--) {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }
  } else {
    // default: yesterday (most recent fully-settled day)
    const d = new Date(); d.setUTCDate(d.getUTCDate() - 1);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Run sequentially over days, parallel within each day (one row per account)
  const all: unknown[] = [];
  for (const date of dates) {
    const r = await snapshotAllAccountsForDay(date);
    all.push(...r);
  }

  const summary = {
    daysSnapshotted: dates.length,
    rowsWritten: (all as { ok: boolean }[]).filter((r) => r.ok).length,
    rowsFailed: (all as { ok: boolean }[]).filter((r) => !r.ok).length,
    latencyMs: Date.now() - t0,
    dates,
  };
  return NextResponse.json({ ...summary, results: all });
}
