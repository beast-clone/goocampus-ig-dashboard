import { NextResponse } from "next/server";
import { scheduleMulti } from "@/lib/schedule-multi";
import { safeError } from "@/lib/errors";

// Cross-post fan-out. Given a source recordId + ISO schedule time + list of "Publish
// To Page" values, update the source row's page to pages[0] and duplicate the row for
// each remaining page. n8n's Native Scheduler then fires one publish per row.
export async function POST(req: Request) {
  let body: { recordId?: string; scheduleTime?: string; pages?: string[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.recordId || !/^rec[A-Za-z0-9]{14}$/.test(body.recordId)) {
    return NextResponse.json({ error: "Valid Airtable recordId required" }, { status: 400 });
  }
  if (!body.scheduleTime || Number.isNaN(Date.parse(body.scheduleTime))) {
    return NextResponse.json({ error: "scheduleTime must be a valid ISO date" }, { status: 400 });
  }
  if (!Array.isArray(body.pages) || body.pages.length === 0) {
    return NextResponse.json({ error: "pages array is required and must be non-empty" }, { status: 400 });
  }
  const ALLOWED = new Set(["GooCampus Main", "GooCampus World", "12Plus / GC India"]);
  const badPage = body.pages.find((p) => !ALLOWED.has(p));
  if (badPage) {
    return NextResponse.json({ error: `Unknown page: ${badPage}` }, { status: 400 });
  }

  try {
    const result = await scheduleMulti(body.recordId, new Date(body.scheduleTime).toISOString(), body.pages);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(safeError(err, "Cross-post failed"), { status: 502 });
  }
}
