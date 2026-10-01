import { NextResponse } from "next/server";
import { runWatchers } from "@/lib/watchers";
import { getSessionIsAdmin, isLoggedIn } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// Watchers, every 15 minutes (netlify/functions/watchers-cron.mts).
//   GET /api/cron/watchers      x-cron-secret: <CRON_SECRET>   (or an admin session, by hand)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const byCron = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!byCron && !(isLoggedIn() && getSessionIsAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const t0 = Date.now();
  try {
    const out = await runWatchers();
    const fresh = out.results.reduce((n, r) => n + r.fresh.length, 0);
    console.log(`[watchers] ${out.checked} checked, ${fresh} new, ${out.results.filter((r) => r.error).length} errors, ${Date.now() - t0}ms`);
    return NextResponse.json({ ok: true, ms: Date.now() - t0, ...out });
  } catch (err) {
    console.error("[watchers] failed", err);
    return NextResponse.json(safeError(err, "Watchers check failed"), { status: 502 });
  }
}
