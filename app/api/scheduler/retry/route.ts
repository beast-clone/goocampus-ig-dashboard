import { NextResponse } from "next/server";
import { retryStuckPost } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

export async function POST(req: Request) {
  let body: { recordId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.recordId || typeof body.recordId !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(body.recordId)) {
    return NextResponse.json({ error: "Valid Airtable recordId required" }, { status: 400 });
  }
  try {
    await retryStuckPost(body.recordId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Retry failed"), { status: 502 });
  }
}
