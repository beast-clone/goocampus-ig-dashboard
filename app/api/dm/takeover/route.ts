import { NextResponse } from "next/server";
import { setThreadMode } from "@/lib/dm";

// POST /api/dm/takeover  { account, sender_id, mode: "ai"|"human" }
export async function POST(req: Request) {
  const body = await req.json() as { account?: string; sender_id?: string; mode?: "ai" | "human" };
  if (!body.account || !body.sender_id || !body.mode) {
    return NextResponse.json({ error: "Missing account / sender_id / mode" }, { status: 400 });
  }
  if (body.mode !== "ai" && body.mode !== "human") {
    return NextResponse.json({ error: "mode must be 'ai' or 'human'" }, { status: 400 });
  }
  const updated = await setThreadMode(body.account, body.sender_id, body.mode);
  if (!updated) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  return NextResponse.json({ ok: true, thread: updated });
}
