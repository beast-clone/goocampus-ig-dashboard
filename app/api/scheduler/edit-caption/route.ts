import { NextResponse } from "next/server";
import { updatePostCaption } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

// Edit a post's caption from the queue view. Writes into all three caption fields
// (Caption / Instagram Caption / Facebook Caption) so whichever the n8n workflow reads,
// it sees the update. Optional per-platform overrides.
export async function POST(req: Request) {
  let body: { recordId?: string; caption?: string; igCaption?: string; fbCaption?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.recordId || !/^rec[A-Za-z0-9]{14}$/.test(body.recordId)) {
    return NextResponse.json({ error: "Valid Airtable recordId required" }, { status: 400 });
  }
  if (typeof body.caption !== "string") {
    return NextResponse.json({ error: "caption required (string)" }, { status: 400 });
  }
  if (body.caption.length > 2200) {
    return NextResponse.json({ error: "Caption exceeds 2200 char limit" }, { status: 400 });
  }

  try {
    await updatePostCaption(body.recordId, body.caption, body.igCaption, body.fbCaption);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Caption update failed"), { status: 502 });
  }
}
