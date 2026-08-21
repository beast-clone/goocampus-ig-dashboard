import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { MH_NAME } from "@/lib/mh-chat";

// POST /api/my-day/swap-request
// A packed producer does NOT pick which task to move — they send their whole
// NOT-STARTED list to Manya ("swap any of these for the incoming task") and SHE
// chooses. Stored as mh_activity 'swap_requested' (detail = candidate list) so
// it persists into Manya's Requests feed; also DMs her so it pings in chat.
// Body: { pendingId, from, candidates: [{ id, title, dur, due }] }
export const dynamic = "force-dynamic";

const TEAM = new Set(["manya", "praveen", "nikhil", "nandu", "maheen"]);

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json()) as { pendingId?: string; from?: string; candidates?: { id: string; title: string; dur: number; due?: string }[] };
    const from = (b.from || "").toLowerCase().trim();
    if (!b.pendingId || !TEAM.has(from)) return NextResponse.json({ error: "pendingId and a valid from are required" }, { status: 400 });
    const candidates = (b.candidates || [])
      .filter((c) => c && typeof c.id === "string" && typeof c.title === "string")
      .slice(0, 20)
      .map((c) => ({ id: c.id, title: String(c.title).slice(0, 140), dur: Number(c.dur) || 0, due: c.due || "" }));
    if (!candidates.length) return NextResponse.json({ error: "no candidates to offer" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { error } = await sb.from("mh_activity").insert({
      post_id: b.pendingId,
      actor_key: from,
      action: "swap_requested",
      detail: candidates,
    });
    if (error) throw new Error(error.message);

    // DM Manya so it pings in chat too (best-effort).
    try {
      const pending = await sb.from("mh_posts").select("particulars").eq("id", b.pendingId).single();
      const list = candidates.map((c) => `“${c.title}”`).join(", ");
      await sb.from("mh_messages").insert({
        convo: [from, "manya"].sort().join("~"),
        sender_key: from,
        kind: "system",
        body: `${MH_NAME[from] || from} is packed — asks to swap one of ${list} for “${pending.data?.particulars || "the queued task"}”. Pick in your Requests.`,
      });
    } catch { /* chat ping is a courtesy */ }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Swap request failed"), { status: 502 });
  }
}
