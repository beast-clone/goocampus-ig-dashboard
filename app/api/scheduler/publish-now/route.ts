import { NextResponse } from "next/server";
import { publishNow } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

// "Publish now" — sets Schedule Time = now + 30 sec so n8n's Native Scheduler picks
// up the row on its next cron tick. Also normalizes Status back to "To Be Scheduled"
// in case the row was previously stuck.
export async function POST(req: Request) {
  let body: { recordId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.recordId || !/^rec[A-Za-z0-9]{14}$/.test(body.recordId)) {
    return NextResponse.json({ error: "Valid Airtable recordId required" }, { status: 400 });
  }
  try {
    await publishNow(body.recordId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Publish now failed"), { status: 502 });
  }
}
