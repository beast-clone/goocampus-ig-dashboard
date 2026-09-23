import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { WA_STATUSES, type WaStatus } from "@/lib/whatsapp";

// POST /api/scheduler/whatsapp/status   header  x-cron-secret: <CRON_SECRET>
//   { id, status, wa_message_id?, error? }
//
// How n8n reports back after a WAHA send. "sent" stamps sent_at; "delivered" can
// arrive later from a WAHA webhook and only updates the status. A failure carries
// its reason so the UI can show it on the row instead of a bare red pill.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string; wa_message_id?: string; error?: string };
    const id = (b.id || "").trim();
    const status = (b.status || "").trim() as WaStatus;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!WA_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${WA_STATUSES.join(", ")}` }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const patch: Record<string, unknown> = { status };
    if (b.wa_message_id) patch.wa_message_id = b.wa_message_id;
    // Keep the reason on a failure, clear a stale one when a retry works.
    patch.error = status === "failed" ? (b.error || "").slice(0, 500) || "WhatsApp send failed" : null;
    if (status === "sent" || status === "delivered") patch.sent_at = new Date().toISOString();

    const { data, error } = await sb
      .from("whatsapp_scheduled_messages")
      .update(patch).eq("id", id)
      .select("id, status").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "message not found" }, { status: 404 });
    return NextResponse.json({ ok: true, message: data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to record the status"), { status: 502 });
  }
}
