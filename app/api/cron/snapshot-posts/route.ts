import { NextResponse } from "next/server";
import { getAccount } from "@/lib/instagram";
import { snapshotPostsForMonth, snapshotAllAccountsPostsForMonth, currentMonth } from "@/lib/post-history";

// Freeze one month of post performance per account into Supabase, so past months
// stay stable + instant on the Overview (see lib/post-history.ts).
//
//   GET /api/cron/snapshot-posts                          -> CURRENT month, ALL accounts
//   GET /api/cron/snapshot-posts?month=2026-08            -> that month, ALL accounts
//   GET /api/cron/snapshot-posts?month=2026-08&accountId=goocampus  -> one account
//
// Per-post insights = one Meta call each, so a month is 15–30s per account. On a
// serverless host, snapshot ONE account per call (pass accountId) to stay under the
// function timeout; run locally without accountId to do them all in one go.
//
// Auth: header `x-cron-secret: <CRON_SECRET>`.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month") || currentMonth();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 });
  }
  const accountId = url.searchParams.get("accountId");
  const t0 = Date.now();

  try {
    if (accountId) {
      const acc = getAccount(accountId);
      if (!acc) return NextResponse.json({ error: `Unknown account ${accountId}` }, { status: 400 });
      const r = await snapshotPostsForMonth(acc, month);
      return NextResponse.json({ month, results: [{ accountId, ...r }], latencyMs: Date.now() - t0 });
    }
    const results = await snapshotAllAccountsPostsForMonth(month);
    const postsWritten = results.filter((r) => r.ok).reduce((s, r) => s + (r.count || 0), 0);
    return NextResponse.json({
      month,
      accountsOk: results.filter((r) => r.ok).length,
      accountsFailed: results.filter((r) => !r.ok).length,
      postsWritten,
      latencyMs: Date.now() - t0,
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
