import { NextResponse } from "next/server";
import { requireCapability, requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";
import { needsDateApproval, needsDateReason } from "@/lib/permissions";
import { requestDateChange, supersedeDateChange } from "@/lib/date-approvals";
import { bustMarketingHubCache } from "@/lib/mh-cache";

export const dynamic = "force-dynamic";

// Drag-to-reschedule from the Post Planner calendar. Writes the new planned date to
// mh_posts.publishing_date — the SAME row/field the team's Marketing Hub works from,
// so the change reflects for them immediately. Only touches publishing_date (does NOT
// enqueue the post for publishing).
export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  // Moving publish dates is the "Change dates" switch on Team & access.
  const __noDates = await requireCapability("reschedule");
  if (__noDates) return __noDates;

  let body: { id?: string; dateISO?: string; note?: string; reason?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!body.dateISO || typeof body.dateISO !== "string" || Number.isNaN(Date.parse(body.dateISO))) {
    return NextResponse.json({ error: "dateISO required (valid ISO 8601)" }, { status: 400 });
  }

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const when = new Date(body.dateISO);
    // In-app "notification" for the owner: stamp a note the team's table can surface.
    const note = (body.note && body.note.trim())
      || `Moved to ${when.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}`;

    // The same date rules as everywhere else (22 Oct review — this route skipped them):
    // moving an existing date asks why (per-person switch), may need an admin's
    // approval, keeps due_date in step, and goes in the task's history.
    const { data: cur } = await sb.from("mh_posts").select("publishing_date, particulars, type, owner_key, created_at").eq("id", body.id).maybeSingle();
    if (!cur) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    const me = (getSessionUserId() || "").toLowerCase();
    const who = await rosterById(me);
    const day = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null);
    const moving = !!cur.publishing_date && day(cur.publishing_date) !== day(when.toISOString());
    const reason = (body.reason || body.note || "").trim();
    if (moving && needsDateReason(who) && !reason) {
      return NextResponse.json({ error: "Add a short reason for moving the date.", gate: "reason" }, { status: 422 });
    }
    if (moving && needsDateApproval(who)) {
      await requestDateChange(sb, {
        postId: body.id, title: String(cur.particulars || "a task"), type: cur.type || undefined,
        owner: cur.owner_key || undefined, createdAt: cur.created_at || undefined,
        from: cur.publishing_date, to: when.toISOString(), reason: reason || undefined, requestedBy: me || "someone",
      });
      return NextResponse.json({ ok: true, pendingApproval: true });
    }
    const { error } = await sb
      .from("mh_posts")
      .update({ publishing_date: when.toISOString(), due_date: when.toISOString().slice(0, 10), planner_note: note, planner_note_at: new Date().toISOString() })
      .eq("id", body.id);
    if (error) throw new Error(error.message);
    if (moving) {
      await supersedeDateChange(sb, body.id, me || "someone");
      const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "unset");
      await sb.from("mh_activity").insert({ post_id: body.id, actor_key: me || null, action: "rescheduled", from_value: fmt(cur.publishing_date), to_value: fmt(when.toISOString()), ...(reason ? { detail: reason } : {}) }).then(() => {}, () => {});
    }
    bustMarketingHubCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Move failed"), { status: 502 });
  }
}
