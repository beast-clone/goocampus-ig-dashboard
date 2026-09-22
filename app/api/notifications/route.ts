import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { buildNotifs, isActionNeeded } from "@/lib/notifications";
import { listPendingDateChanges } from "@/lib/date-approvals";
import { todayIST } from "@/lib/date";

// Stored notifications for the SIGNED-IN person — the Notifications tab, the
// on-screen pop-ups and re-pop. See docs/NOTIFICATIONS_SPEC.md.
//
//   GET   → sync new events into mh_notifications, mark finished action items
//           done, and return the person's notifications (newest first)
//   PATCH → { op: "read" | "dismiss" | "popped" | "delete", ids?: string[], all?: true, category?: string }
//
// Always scoped to the session user, never a ?person= parameter, so nobody can
// read or clear someone else's notifications.
export const dynamic = "force-dynamic";

type Row = {
  id: string; source_id: string; kind: string; category: string; action_needed: boolean;
  emoji: string | null; title: string; sub: string | null; post_id: string | null;
  payload: Record<string, unknown>; created_at: string;
  read_at: string | null; dismissed_at: string | null; last_popped_at: string | null;
  done_at: string | null;
};

const FIRST_SYNC_DAYS = 30;   // a person's first sync reaches back this far
const OVERLAP_MS = 86_400_000; // re-read a day behind the newest stored one; the unique key dedupes

const who = () => (getSessionUserId() || "").toLowerCase();

// Quiet hours (spec §6), decided here in IST so it never depends on the viewer's
// computer clock: no pop-ups on weekends, outside the person's shift (9 AM–6 PM,
// Nandu 10 AM–7 PM — the same shifts My Day plans against), or once they have
// pressed End day. Notifications still arrive in the tab; only the pop-up waits.
async function isQuiet(sb: NonNullable<ReturnType<typeof getSupabase>>, person: string): Promise<boolean> {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return true;
  const mins = Number(parts.hour) * 60 + Number(parts.minute);
  const start = person === "nandu" ? 10 * 60 : 9 * 60;
  if (mins < start || mins >= start + 9 * 60) return true;
  const { data } = await sb.from("mh_attendance").select("logout_at").eq("person_key", person).eq("date", todayIST()).maybeSingle();
  return !!data?.logout_at;
}

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const person = who();
    if (!person) return NextResponse.json({ items: [] });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    // 1. Sync — generate since the newest one we already hold (first time: 30 days),
    //    and store. Each event notifies each person once: (recipient_key, source_id)
    //    is unique, and a duplicate is simply skipped.
    const { data: newest } = await sb.from("mh_notifications").select("created_at")
      .eq("recipient_key", person).order("created_at", { ascending: false }).limit(1);
    const since = newest?.length
      ? new Date(new Date(newest[0].created_at).getTime() - OVERLAP_MS).toISOString()
      : new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000).toISOString();
    const { notifs, createdNotifs } = await buildNotifs(sb, person, since);
    const fresh = [...createdNotifs, ...notifs].map((n) => ({
      recipient_key: person,
      source_id: n.id,
      kind: n.kind,
      category: n.cat,
      action_needed: isActionNeeded(n),
      emoji: n.emoji,
      title: n.title,
      sub: n.sub,
      post_id: n.taskId || n.postId || null,
      payload: { ...(n.accept ? { accept: true } : {}), ...(n.swap ? { swap: n.swap } : {}) },
      created_at: n.at,
    }));
    if (fresh.length) {
      const { error } = await sb.from("mh_notifications")
        .upsert(fresh, { onConflict: "recipient_key,source_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }

    // 2. Unpin action items whose action has actually been done (spec §5).
    //    Read is not done — this is the only thing that clears "Action needed".
    await resolveDone(sb, person);

    // 3. The person's notifications.
    const { data, error } = await sb.from("mh_notifications")
      .select("id, source_id, kind, category, action_needed, emoji, title, sub, post_id, payload, created_at, read_at, dismissed_at, last_popped_at, done_at")
      .eq("recipient_key", person).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return NextResponse.json({ items: (data || []) as Row[], quiet: await isQuiet(sb, person) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load notifications"), { status: 502 });
  }
}

// Which open action items are now finished (spec §5):
//   date change to approve → no longer pending (approved or rejected)
//   waiting in pipeline    → the person took it, or it left Content - Approved
//   swap request           → the task now belongs to the person who asked
//   sent back for changes  → the task left Incorporating Feedback
//   any of them            → the task no longer exists
async function resolveDone(sb: NonNullable<ReturnType<typeof getSupabase>>, person: string) {
  const { data: open } = await sb.from("mh_notifications")
    .select("id, title, post_id, payload")
    .eq("recipient_key", person).eq("action_needed", true)
    .is("done_at", null).is("deleted_at", null).limit(200);
  if (!open?.length) return;

  const postIds = [...new Set(open.map((o) => o.post_id).filter(Boolean) as string[])];
  const posts = new Map<string, { status: string | null; owner_key: string | null }>();
  if (postIds.length) {
    const { data } = await sb.from("mh_posts").select("id, status, owner_key").in("id", postIds);
    (data || []).forEach((p) => posts.set(p.id as string, { status: p.status as string | null, owner_key: p.owner_key as string | null }));
  }
  const hasDateItem = open.some((o) => o.title === "Publish-date change to approve");
  const pendingDates = hasDateItem
    ? new Set((await listPendingDateChanges(sb)).map((r) => r.postId))
    : new Set<string>();

  const done: string[] = [];
  for (const o of open) {
    const p = o.post_id ? posts.get(o.post_id as string) : undefined;
    const payload = (o.payload || {}) as { accept?: boolean; swap?: { from?: string } };
    if (o.post_id && !p) { done.push(o.id); continue; }  // task deleted
    if (!p) continue;
    if (o.title === "Publish-date change to approve") {
      if (!pendingDates.has(o.post_id as string)) done.push(o.id);
    } else if (payload.accept) {
      if ((p.owner_key || "").toLowerCase() === person || p.status !== "Content - Approved") done.push(o.id);
    } else if (payload.swap) {
      if (payload.swap.from && p.owner_key === payload.swap.from) done.push(o.id);
    } else if (o.title === "Sent back for changes") {
      if (p.status !== "Incorporating Feedback") done.push(o.id);
    }
  }
  if (done.length) {
    await sb.from("mh_notifications").update({ done_at: new Date().toISOString() }).in("id", done);
  }
}

export async function PATCH(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const person = who();
    if (!person) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const body = (await req.json()) as { op?: string; ids?: string[]; all?: boolean; category?: string };
    const now = new Date().toISOString();
    const patch: Record<string, string> | null =
      body.op === "read" ? { read_at: now }
      : body.op === "dismiss" ? { dismissed_at: now }
      : body.op === "popped" ? { last_popped_at: now }
      : body.op === "delete" ? { deleted_at: now }
      : null;
    if (!patch) return NextResponse.json({ error: "op must be read | dismiss | popped | delete" }, { status: 400 });
    if (!body.all && !body.category && !(body.ids && body.ids.length)) {
      return NextResponse.json({ error: "ids, category or all required" }, { status: 400 });
    }

    let q = sb.from("mh_notifications").update(patch).eq("recipient_key", person).is("deleted_at", null);
    if (body.ids?.length) q = q.in("id", body.ids);
    if (body.category) q = q.eq("category", body.category);
    // Mark-read only touches unread ones, so "read at" keeps the FIRST time it was read.
    if (body.op === "read") q = q.is("read_at", null);
    // A pending action item cannot be deleted — it would lose the only reminder
    // (spec §4). It becomes deletable once done.
    if (body.op === "delete") q = q.or("action_needed.eq.false,done_at.not.is.null");
    const { error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to update notifications"), { status: 502 });
  }
}
