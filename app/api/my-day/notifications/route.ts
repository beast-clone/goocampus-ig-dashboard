import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { VIDEO_TYPES } from "@/lib/mh-content-types";

// GET /api/my-day/notifications?person=<key>
// Real notifications for the My Day cockpit, derived from the mh_activity event log:
//   • a video was claimed          -> the OTHER editor hears about it
//   • a task was approved/handed   -> the receiver (designer, or the editor pool)
//   • a task was sent back         -> its current owner (Incorporating Feedback)
//   • a task was pushed to schedule -> its current owner (Ready to Publish)
// You never get notified about your own action. Read-only, Supabase-native.
export const dynamic = "force-dynamic";

const NAME: Record<string, string> = {
  manya: "Manya", praveen: "Praveen", nikhil: "Nikhil", nandu: "Nandu", maheen: "Maheen",
};
const EDITORS = ["nandu", "nikhil"];
// No actor on the event = an automation did it (link write-backs, schedulers…)
// → say "System", never a vague "Someone" (same convention as the activity feed).
const nameOf = (k: string | null) => (k ? NAME[k.toLowerCase()] || k : "System");
const siblingOf = (k: string) => (k === "nandu" ? "nikhil" : k === "nikhil" ? "nandu" : null);

type Act = {
  id: number; post_id: string; actor_key: string | null; action: string;
  from_value: string | null; to_value: string | null; created_at: string;
};
type Post = { id: string; particulars: string | null; owner_key: string | null; type: string | null };
type SwapCand = { id: string; title: string; dur: number; due?: string };
type Notif = { id: string; kind: string; emoji: string; title: string; sub: string; postId?: string; accept?: boolean; swap?: { from: string; candidates: SwapCand[] } };

export async function GET(req: Request) {
  try {
    const person = (new URL(req.url).searchParams.get("person") || "").toLowerCase();
    if (!person) return NextResponse.json({ notifs: [] });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const { data: acts, error } = await sb
      .from("mh_activity")
      .select("id, post_id, actor_key, action, from_value, to_value, detail, created_at")
      // All edits now log as status_changed / owner_changed / claim (app-attributed).
      .in("action", ["claim", "status_changed", "owner_changed", "due_date_changed", "rescheduled", "swap_requested"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(160);
    if (error) throw new Error(error.message);

    const events = (acts || []) as Act[];

    // A reassignment (owner_changed) that is really a claim or an approval-handoff
    // is already announced by its own event — don't double-notify. Collect those
    // post_ids so the owner_changed branch below skips them.
    const claimedOrHandedOff = new Set(
      events.filter((e) => e.action === "claim" || (e.action === "status_changed" && e.to_value === "Content - Approved")).map((e) => e.post_id),
    );
    const ids = [...new Set(events.map((e) => e.post_id).filter(Boolean))];
    const postMap = new Map<string, Post>();
    if (ids.length) {
      const { data: posts } = await sb
        .from("mh_posts")
        .select("id, particulars, owner_key, type")
        .in("id", ids);
      (posts || []).forEach((p) => postMap.set((p as Post).id, p as Post));
    }

    const notifs: Notif[] = [];
    const seen = new Set<string>();

    for (const e of events) {
      const post = postMap.get(e.post_id);
      const t = post?.particulars || "a task";
      const short = t.length > 46 ? `${t.slice(0, 44)}…` : t;

      let target: string[] = [];
      let n: Omit<Notif, "id"> | null = null;

      if (e.action === "claim") {
        const sib = e.actor_key ? siblingOf(e.actor_key.toLowerCase()) : null;
        if (sib) {
          target = [sib];
          n = { kind: "claim", emoji: "✓", title: `${nameOf(e.actor_key)} claimed a video`, sub: `"${short}" is off the board — you're clear on that one.` };
        }
      } else if (e.action === "status_changed" && e.to_value === "Content - Approved") {
        // Approval = the handoff. Design → Praveen; video → the editor pool.
        if (VIDEO_TYPES.has(post?.type || "")) {
          // Only advertise as "up for grabs" while still unclaimed. Once an editor
          // owns it (claimed via takeover), stop telling editors to claim it.
          if (post && !EDITORS.includes((post.owner_key || "").toLowerCase())) {
            target = EDITORS;
            n = { kind: "message", emoji: "🎬", title: "New video up for grabs", sub: `"${short}" was approved — claim it from the pool.` };
          }
        } else if (post && (post.owner_key || "").toLowerCase() !== "praveen") {
          // Deferred handoff (assigner saw "day full" and queued it): ownership is
          // still with the writer — Praveen must ACCEPT to take it. postId powers
          // the Accept button; the task joins his board only via that takeover.
          target = ["praveen"];
          n = { kind: "message", emoji: "⏳", title: "Waiting in your pipeline", sub: `"${short}" is approved and queued for you — accept when you have room.`, postId: e.post_id, accept: true };
        } else {
          target = ["praveen"];
          n = { kind: "message", emoji: "📥", title: "Approved — handed to you", sub: `"${short}" is ready for you to produce.` };
        }
      } else if (e.action === "status_changed" && e.to_value === "Incorporating Feedback") {
        if (post?.owner_key) {
          target = [post.owner_key];
          n = { kind: "message", emoji: "↩️", title: "Sent back for changes", sub: `"${short}" was returned from review — needs changes.` };
        }
      } else if (e.action === "status_changed" && e.to_value === "Ready to Publish") {
        if (post?.owner_key) {
          target = [post.owner_key];
          n = { kind: "message", emoji: "📅", title: "Cleared review → scheduled", sub: `"${short}" is queued in the Scheduler.` };
        }
      } else if (e.action === "swap_requested") {
        // A packed producer offered their not-started list — MANYA picks which
        // task to move; the candidates travel in the activity's detail payload.
        let candidates: SwapCand[] = [];
        try {
          const d = (e as { detail?: unknown }).detail;
          candidates = (typeof d === "string" ? JSON.parse(d) : d) as SwapCand[] || [];
        } catch { candidates = []; }
        if (candidates.length && e.actor_key) {
          target = ["manya"];
          n = { kind: "message", emoji: "🔁", title: `${nameOf(e.actor_key)} is packed — pick a task to move`, sub: `Offers ${candidates.length} not-started task${candidates.length > 1 ? "s" : ""} to swap for "${short}".`, postId: e.post_id, swap: { from: e.actor_key, candidates } };
        }
      } else if (e.action === "due_date_changed" || e.action === "rescheduled") {
        // A producer moved a date (e.g. make-room rolled a task to tomorrow) →
        // Manya, who created/plans the work, gets the change request in HER
        // Requests feed. Her own date edits don't notify her (self-filter below).
        target = ["manya"];
        n = { kind: "message", emoji: "📅", title: `${nameOf(e.actor_key)} moved a date`, sub: `"${short}" → ${e.to_value || "updated"}${e.from_value ? ` (was ${e.from_value})` : ""}.` };
      } else if (e.action === "owner_changed") {
        // Plain reassignment (not a claim/handoff): tell the new owner it's theirs.
        if (e.to_value && !claimedOrHandedOff.has(e.post_id)) {
          target = [e.to_value];
          n = { kind: "message", emoji: "📌", title: "Assigned to you", sub: `"${short}" was handed to you by ${nameOf(e.from_value)}.` };
        }
      }

      if (!n) continue;
      if (!target.map((x) => x.toLowerCase()).includes(person)) continue;
      if (e.actor_key && e.actor_key.toLowerCase() === person) continue; // never notify yourself
      const key = `${e.action}:${e.post_id}:${e.to_value || ""}`;
      if (seen.has(key)) continue; // collapse repeats of the same event on the same post
      seen.add(key);
      notifs.push({ id: `a${e.id}`, ...n });
    }

    return NextResponse.json({ notifs: notifs.slice(0, 12) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load notifications"), { status: 502 });
  }
}
