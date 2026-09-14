// Publish-date change approvals.
//
// Changing a post's PUBLISHING DATE (only that — content/type/etc. still save
// normally) is held for approval by Maheen instead of applying immediately. The
// request is parked in `discover_cache` (no migration), and Maheen is pinged on
// every available channel: team chat, the My Day bell (an mh_activity event), and
// email. She approves → the date is written; rejects → the old date stays.

import { getSupabase } from "@/lib/supabase";
import { postTeamMessage, MH_NAME } from "@/lib/mh-chat";
import { sendMail, hasEmail } from "@/lib/email";

type SB = NonNullable<ReturnType<typeof getSupabase>>;

export const APPROVER_KEY = "maheen";
const APPROVER_EMAIL = process.env.APPROVER_EMAIL || "info@goocampus.in";

export type DateChangeRequest = {
  postId: string;
  title: string;
  from: string | null;   // old publishing_date
  to: string | null;     // requested publishing_date
  requestedBy: string;   // owner key
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  resolvedBy?: string;
  resolvedAt?: string;
};

const KEY = (postId: string) => `datechg:${postId}`;
const nameOf = (k: string) => MH_NAME[k] || k.charAt(0).toUpperCase() + k.slice(1);
const fmt = (d: string | null) => (d ? new Date(String(d)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "unset");

// Raise (or replace) the pending request for a post + notify the approver.
export async function requestDateChange(sb: SB, r: { postId: string; title: string; from: string | null; to: string | null; requestedBy: string }): Promise<DateChangeRequest> {
  const payload: DateChangeRequest = { ...r, requestedAt: new Date().toISOString(), status: "pending" };
  await sb.from("discover_cache").upsert(
    { cache_key: KEY(r.postId), source: "mh_date_change_request", last_fetched: new Date().toISOString(), payload },
    { onConflict: "cache_key" },
  );

  const who = nameOf(r.requestedBy);
  const line = `📅 ${who} asked to move “${r.title}” publish date from ${fmt(r.from)} → ${fmt(r.to)}. Needs your approval, Maheen.`;

  // 1) team chat
  await postTeamMessage(sb, r.requestedBy, line);
  // 2) My Day bell — an mh_activity event the notifications route surfaces to Maheen
  try {
    await sb.from("mh_activity").insert({ post_id: r.postId, actor_key: r.requestedBy, action: "date_change_requested", from_value: fmt(r.from), to_value: fmt(r.to) });
  } catch { /* activity is best-effort */ }
  // 3) email
  if (hasEmail()) {
    try {
      await sendMail({
        to: APPROVER_EMAIL,
        subject: `Approve publish-date change — “${r.title}”`,
        text: `${who} requested to move the publish date of “${r.title}” from ${fmt(r.from)} to ${fmt(r.to)}.\n\nApprove or reject it in the Marketing OS (My Day → Publish-date approvals).`,
        html: `<p><b>${who}</b> requested to move the publish date of “<b>${r.title}</b>” from <b>${fmt(r.from)}</b> to <b>${fmt(r.to)}</b>.</p><p>Approve or reject it in the Marketing OS → <i>My Day → Publish-date approvals</i>.</p>`,
      });
    } catch { /* email is best-effort */ }
  }
  return payload;
}

export async function listPendingDateChanges(sb: SB): Promise<DateChangeRequest[]> {
  const { data } = await sb
    .from("discover_cache")
    .select("payload")
    .eq("source", "mh_date_change_request")
    .eq("payload->>status", "pending")
    .order("last_fetched", { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => r.payload as DateChangeRequest);
}

export async function getDateChange(sb: SB, postId: string): Promise<DateChangeRequest | null> {
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", KEY(postId)).maybeSingle();
  return (data?.payload as DateChangeRequest) ?? null;
}

// Approve → write the date; reject → discard. Either way notify the requester.
export async function resolveDateChange(sb: SB, opts: { postId: string; action: "approve" | "reject"; approverKey: string }): Promise<{ ok: boolean; error?: string; request?: DateChangeRequest }> {
  const req = await getDateChange(sb, opts.postId);
  if (!req || req.status !== "pending") return { ok: false, error: "No pending date-change request for this task." };

  if (opts.action === "approve") {
    const { error } = await sb.from("mh_posts").update({ publishing_date: req.to, due_date: req.to }).eq("id", opts.postId);
    if (error) return { ok: false, error: error.message };
    await sb.from("mh_activity").insert({ post_id: opts.postId, actor_key: opts.approverKey, action: "rescheduled", from_value: fmt(req.from), to_value: fmt(req.to) });
    await postTeamMessage(sb, opts.approverKey, `✅ ${nameOf(opts.approverKey)} approved the publish-date change on “${req.title}” → ${fmt(req.to)}.`);
  } else {
    await postTeamMessage(sb, opts.approverKey, `⛔ ${nameOf(opts.approverKey)} kept “${req.title}” on ${fmt(req.from)} — publish-date change declined.`);
  }

  const resolved: DateChangeRequest = { ...req, status: opts.action === "approve" ? "approved" : "rejected", resolvedBy: opts.approverKey, resolvedAt: new Date().toISOString() };
  await sb.from("discover_cache").upsert(
    { cache_key: KEY(opts.postId), source: "mh_date_change_request", last_fetched: new Date().toISOString(), payload: resolved },
    { onConflict: "cache_key" },
  );
  return { ok: true, request: resolved };
}
