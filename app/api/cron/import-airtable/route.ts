import { NextResponse } from "next/server";
import { importFromAirtable, isNetworkError } from "@/lib/airtable-import";
import { safeError } from "@/lib/errors";

// Hourly sync from Airtable's Content Calendar into the master sheet.
//
//   GET /api/cron/import-airtable
//   Header: x-cron-secret: <CRON_SECRET>
//
// Fired by netlify/functions/import-airtable-cron.mts. The Sync button in the
// Marketing Hub runs the same newest-wins import; this is the unattended version.
//
// It adds new tasks and updates existing ones only where Airtable holds the newer
// change (newestWins — see lib/airtable-import.ts). It used to only add (newOnly),
// so a task published in Airtable never updated here; a plain overwrite would undo
// the team's own edits. Newest-wins does neither.
//
// No date range: the Airtable view (IMPORT_VIEW, "Task Dashboard") already decides
// what is in scope, and it is small. Records that were deleted in the dashboard stay
// deleted — the importer skips anything in the recycle bin.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await importFromAirtable({ newestWins: true });
    const ms = Date.now() - startedAt;
    // One line per run in the Netlify function log — enough to answer "did it run,
    // did it add anything, and is it getting slower" without any extra tables.
    console.log(`[cron/import-airtable] ${result.created} added, ${result.updated} updated, ${result.scanned} in view, ${ms}ms`);
    return NextResponse.json({ ok: true, ms, added: result.created, updated: result.updated, inView: result.scanned, skipped: result.skipped, errors: result.errors });
  } catch (err) {
    console.error("[cron/import-airtable] failed", err);
    if (isNetworkError(err)) return NextResponse.json({ error: "Lost connection to Airtable or Supabase" }, { status: 502 });
    return NextResponse.json(safeError(err, "Hourly Airtable import failed"), { status: 502 });
  }
}
