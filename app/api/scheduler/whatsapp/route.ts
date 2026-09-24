import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { normalizeChatId, STATUS_CHAT, WA_COLS, type WaKind, type WaPoll, type WaRepeat, type WaRepeatRule } from "@/lib/whatsapp";
import { spreadSchedule } from "@/lib/whatsapp-safety";

// WhatsApp broadcast queue — its own table (whatsapp_scheduled_messages), fully
// separate from the Meta/n8n post pipeline and from the LinkedIn queue it copies.
// The dashboard never calls WAHA: it has no public port. n8n on the same VPS polls
// /api/scheduler/whatsapp/due, sends, and posts back to .../status.
//   GET  /api/scheduler/whatsapp   -> recent messages for the UI
//   POST /api/scheduler/whatsapp   { kind?, chats:[{id,label?}], body?, imageUrl?, poll?, scheduleTimeISO? }
// kind: "message" (default) | "poll" | "status". A status goes to status@broadcast
// and needs no recipient — WhatsApp sends it to the account's contacts.
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
      kind?: string; chats?: { id?: string; label?: string }[];
      body?: string; imageUrl?: string; mime?: string; poll?: Partial<WaPoll>; scheduleTimeISO?: string;
      gapMinutes?: number;      // hand-set gap between individuals; floored at 5
      bodies?: Record<string, string>;   // per-recipient text, when each one differs
      repeat?: { rule?: string; until?: string | null };
      session?: string;   // which linked WhatsApp account sends it
    };
    const kind: WaKind = b.kind === "poll" ? "poll" : b.kind === "status" ? "status" : "message";

    const seen = new Set<string>();
    const chats = (b.chats || [])
      .map((c) => ({ id: normalizeChatId(c?.id || ""), label: (c?.label || "").trim() || null }))
      .filter((c): c is { id: string; label: string | null } => !!c.id)
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
    const text = (b.body || "").trim();
    const imageUrl = (b.imageUrl || "").trim() || null;
    // The worker has to know whether this is a photo, a video or a document, and a
    // file name is a poor way to tell: a long one loses its extension. Carry the
    // type the upload reported so nothing downstream has to guess (24 Sep — a PDF
    // went out as a photo and WhatsApp showed a broken image).
    const mime = (b.mime || "").trim().slice(0, 100) || null;

    // A status has no recipient to pick — it goes to the account's contacts.
    const targets = kind === "status" ? [{ id: STATUS_CHAT, label: "My Status" }] : chats;

    let poll: WaPoll | null = null;
    if (kind === "poll") {
      const name = (b.poll?.name || "").trim();
      const options = (b.poll?.options || []).map((o) => (o || "").trim()).filter(Boolean).slice(0, 12);
      if (!name) return NextResponse.json({ error: "the poll needs a question" }, { status: 400 });
      if (options.length < 2) return NextResponse.json({ error: "a poll needs at least two options" }, { status: 400 });
      poll = { name, options, multipleAnswers: !!b.poll?.multipleAnswers };
    }

    if (!targets.length) return NextResponse.json({ error: "pick at least one recipient (a number, group id or channel id)" }, { status: 400 });
    if (kind !== "poll" && !text && !imageUrl) return NextResponse.json({ error: "nothing to send (a message or an image is required)" }, { status: 400 });

    // No time → send on the worker's next tick, same as the LinkedIn queue.
    const when = b.scheduleTimeISO ? new Date(b.scheduleTimeISO) : new Date();
    if (isNaN(when.getTime())) return NextResponse.json({ error: "invalid schedule time" }, { status: 400 });

    // The repeat rides in payload — the next occurrence is queued when this one
    // completes, so exactly one row is ever pending per series.
    const rule = (b.repeat?.rule || "none") as WaRepeatRule;
    const repeat: WaRepeat | null =
      rule === "daily" || rule === "weekly" || rule === "monthly"
        ? { rule, until: b.repeat?.until || null, anchorDay: when.getDate() }
        : null;

    // Which account sends it. Left off, the sender falls back to "default", so
    // rows queued before multi-account keep working untouched.
    const session = (b.session || "").trim() || null;

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb
      .from("whatsapp_scheduled_messages")
      // Several recipients are spread 30–60 seconds apart instead of all going in
      // the same minute. Forty messages at once is the burst that gets a number
      // flagged, and WAHA's own guidance is a random gap, never a fixed one. A
      // single recipient keeps exactly the time that was asked for.
      .insert(spreadSchedule(when.toISOString(), targets.map((t) => t.id), b.gapMinutes).map((at, i) => ({
        chat_id: targets[i].id, chat_label: targets[i].label,
        // A different wording per person when one was written for them — the same
        // string to forty people is the pattern that gets reported.
        body: (b.bodies && b.bodies[targets[i].id]) || text || null,
        image_url: imageUrl,
        schedule_time: at, status: "scheduled",
        kind,
        // mime rides along so the worker never has to guess a file's type from
        // its name — a long name loses its extension, and a PDF then went out
        // as a photo (24 Sep).
        payload: poll || repeat || session || mime
          ? { ...(poll ? { poll } : {}), ...(repeat ? { repeat } : {}), ...(session ? { session } : {}), ...(mime ? { mime } : {}) }
          : null,
        created_by: getSessionUserId() || null,
      })))
      .select(WA_COLS);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, messages: data || [], count: (data || []).length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to schedule the WhatsApp message"), { status: 502 });
  }
}

// DELETE /api/scheduler/whatsapp?id=<id>[&id=<id>…]
//
// Cancelling stops a message going out but keeps the record — you usually want to
// see that it was pulled. Deleting is for when you want it gone from the list
// entirely, and it is the only way to clear failed rows.
//
// A row that n8n has already claimed ("sending") is left alone: WhatsApp may be
// mid-send, and deleting the row would lose the record of a message that went out.
export async function DELETE(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const ids = new URL(req.url).searchParams.getAll("id").filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb
      .from("whatsapp_scheduled_messages")
      .delete().in("id", ids).neq("status", "sending")
      .select("id");
    if (error) throw new Error(error.message);

    const deleted = (data || []).length;
    if (!deleted) {
      return NextResponse.json(
        { error: "nothing deleted — a message being sent right now cannot be removed" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to delete"), { status: 502 });
  }
}
