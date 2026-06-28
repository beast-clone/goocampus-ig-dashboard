// Called by n8n every time it processes a DM. Mirrors the conversation into Supabase.
// Usage: POST /api/dm/mirror  with header x-cron-secret OR ?secret=
// Body: { account, sender_id, username?, direction: "in"|"out", text, source?: "user"|"ai"|"human", message_id?, at? }
import { NextResponse } from "next/server";
import { recordInbound, recordOutbound } from "@/lib/dm";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  return !!secret && (req.headers.get("x-cron-secret") === secret || url.searchParams.get("secret") === secret);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json() as {
      account: string; sender_id: string; username?: string;
      direction: "in" | "out"; text: string;
      source?: "user" | "ai" | "human"; message_id?: string; at?: string;
    };
    if (!body.account || !body.sender_id || !body.text || !body.direction) {
      return NextResponse.json({ error: "Missing account / sender_id / direction / text" }, { status: 400 });
    }
    if (body.direction === "in") {
      const t = await recordInbound({ account: body.account, sender_id: body.sender_id, username: body.username, text: body.text, messageId: body.message_id, at: body.at });
      return NextResponse.json({ ok: true, thread: t });
    } else {
      const t = await recordOutbound({ account: body.account, sender_id: body.sender_id, text: body.text, source: body.source === "human" ? "human" : "ai", messageId: body.message_id, at: body.at });
      return NextResponse.json({ ok: true, thread: t });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
