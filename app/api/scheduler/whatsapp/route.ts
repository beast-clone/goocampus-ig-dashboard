import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { normalizeChatId, WA_COLS } from "@/lib/whatsapp";

// WhatsApp broadcast queue — its own table (whatsapp_scheduled_messages), fully
// separate from the Meta/n8n post pipeline and from the LinkedIn queue it copies.
// The dashboard never calls WAHA: it has no public port. n8n on the same VPS polls
// /api/scheduler/whatsapp/due, sends, and posts back to .../status.
//   GET  /api/scheduler/whatsapp   -> recent messages for the UI
//   POST /api/scheduler/whatsapp   { chats:[{id,label?}], body?, imageUrl?, scheduleTimeISO? }
// A send to several recipients becomes one row each, so one failure never hides
// the rest (and it is what Blueticks does: "scheduled individually for each one").
export const dynamic = "force-dynamic";

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb
      .from("whatsapp_scheduled_messages")
      .select(WA_COLS)
      .order("schedule_time", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return NextResponse.json({ messages: data || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load scheduled WhatsApp messages"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json()) as {
      chats?: { id?: string; label?: string }[];
      body?: string; imageUrl?: string; scheduleTimeISO?: string;
    };

    const seen = new Set<string>();
    const chats = (b.chats || [])
      .map((c) => ({ id: normalizeChatId(c?.id || ""), label: (c?.label || "").trim() || null }))
      .filter((c): c is { id: string; label: string | null } => !!c.id)
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    const text = (b.body || "").trim();
    const imageUrl = (b.imageUrl || "").trim() || null;

    if (!chats.length) return NextResponse.json({ error: "pick at least one recipient (a number, group id or channel id)" }, { status: 400 });
    if (!text && !imageUrl) return NextResponse.json({ error: "nothing to send (a message or an image is required)" }, { status: 400 });

    // No time → send on the worker's next tick, same as the LinkedIn queue.
    const when = b.scheduleTimeISO ? new Date(b.scheduleTimeISO) : new Date();
    if (isNaN(when.getTime())) return NextResponse.json({ error: "invalid schedule time" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb
      .from("whatsapp_scheduled_messages")
      .insert(chats.map((c) => ({
        chat_id: c.id, chat_label: c.label,
        body: text || null, image_url: imageUrl,
        schedule_time: when.toISOString(), status: "scheduled",
        created_by: getSessionUserId() || null,
      })))
      .select(WA_COLS);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, messages: data || [], count: (data || []).length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to schedule the WhatsApp message"), { status: 502 });
  }
}
