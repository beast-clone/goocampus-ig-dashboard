import { NextResponse } from "next/server";
import { updateScheduleTime } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

// PATCH a Post Scheduler row's Schedule Time. Used by the inline datetime picker on
// each queue card.
export async function POST(req: Request) {
  let body: { recordId?: string; scheduleTime?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.recordId || !/^rec[A-Za-z0-9]{14}$/.test(body.recordId)) {
    return NextResponse.json({ error: "Valid Airtable recordId required" }, { status: 400 });
  }
  if (!body.scheduleTime || typeof body.scheduleTime !== "string") {
    return NextResponse.json({ error: "scheduleTime required (ISO 8601)" }, { status: 400 });
  }
  const parsed = Date.parse(body.scheduleTime);
  if (Number.isNaN(parsed)) {
    return NextResponse.json({ error: "scheduleTime is not a valid ISO date" }, { status: 400 });
  }

  try {
    await updateScheduleTime(body.recordId, new Date(parsed).toISOString());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Reschedule failed"), { status: 502 });
  }
}
