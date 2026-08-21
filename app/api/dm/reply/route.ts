import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { queueReply } from "@/lib/dm";

// POST /api/dm/reply  { account, sender_id, text }
// Queues a human reply. n8n picks it up on the next /should-takeover hit.
export async function POST(req: Request) {
  const __denied = await requireSection("sales");
  if (__denied) return __denied;

  const body = await req.json() as { account?: string; sender_id?: string; text?: string };
  if (!body.account || !body.sender_id || !body.text?.trim()) {
    return NextResponse.json({ error: "Missing account / sender_id / text" }, { status: 400 });
  }
  await queueReply({
    account: body.account,
    sender_id: body.sender_id,
    reply: body.text.trim(),
    queued_at: new Date().toISOString(),
    queued_by: "dashboard",
  });
  return NextResponse.json({ ok: true });
}
