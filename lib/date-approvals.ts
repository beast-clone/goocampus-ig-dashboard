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
import { postSlack } from "@/lib/slack";

type SB = NonNullable<ReturnType<typeof getSupabase>>;

export const APPROVER_KEY = "maheen";
const APPROVER_EMAIL = process.env.APPROVER_EMAIL || "info@goocampus.in";

export type DateChangeRequest = {
  postId: string;
  title: string;
  type?: string;          // content type (Reel / Carousel / …)
  owner?: string;         // assignee (owner_key)
  createdAt?: string;     // when the task was created
  creator?: string;       // who created it (best-effort, from the activity log)
  from: string | null;    // old publishing_date
  to: string | null;      // requested publishing_date
  reason?: string;        // why they want it moved (from the requester)
  requestedBy: string;    // who is asking for the change
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  resolvedBy?: string;
  resolvedAt?: string;
};

const KEY = (postId: string) => `datechg:${postId}`;
const nameOf = (k: string) => (k ? (MH_NAME[k] || k.charAt(0).toUpperCase() + k.slice(1)) : "Someone");
const fmt = (d: string | null | undefined) => (d ? new Date(String(d)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "unset");
const fmtDT = (d: string | null | undefined) => (d ? new Date(String(d)).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

// Raise (or replace) the pending request for a post + notify the approver.
export async function requestDateChange(sb: SB, r: { postId: string; title: string; type?: string; owner?: string; createdAt?: string; from: string | null; to: string | null; reason?: string; requestedBy: string }): Promise<DateChangeRequest> {
  // Best-effort "who created it": the earliest actor in the task's activity log.
  let creator: string | undefined;
  try {
    const { data } = await sb.from("mh_activity").select("actor_key").eq("post_id", r.postId).order("created_at", { ascending: true }).limit(1);
    creator = (data?.[0]?.actor_key as string) || undefined;
  } catch { /* leave undefined */ }

  const payload: DateChangeRequest = { ...r, creator, requestedAt: new Date().toISOString(), status: "pending" };
  await sb.from("discover_cache").upsert(
    { cache_key: KEY(r.postId), source: "mh_date_change_request", last_fetched: new Date().toISOString(), payload },
    { onConflict: "cache_key" },
  );

  const who = nameOf(r.requestedBy);
  const reason = r.reason?.trim() || "—";
  const meta = `Type: ${r.type || "—"} · Assigned to: ${nameOf(r.owner || "")} · Created: ${fmtDT(r.createdAt)}${creator ? ` by ${nameOf(creator)}` : ""}`;

  // 1) team chat
  await postTeamMessage(sb, r.requestedBy, `📅 ${who} asked to move “${r.title}” from ${fmt(r.from)} → ${fmt(r.to)} — reason: ${reason}. Needs your approval, Maheen.`);
  // 1b) Slack (#creative_marketing) — full, clearly-laid-out card
  await postSlack(
    `📅 *Publish-date change — needs your approval*\n` +
    `*Task:* ${r.title}   _(${r.type || "—"})_\n` +
    `*Assigned to:* ${nameOf(r.owner || "")}\n` +
    `*Created:* ${fmtDT(r.createdAt)}${creator ? ` by *${nameOf(creator)}*` : ""}\n` +
    `*Move publish date:* ${fmt(r.from)} → *${fmt(r.to)}*\n` +
    `*Requested by:* ${who}\n` +
    `*Reason:* ${reason}\n` +
    `➡️ Approve or reject it in *Marketing OS → My Day → Publish-date approvals*.`,
  );
  // 2) My Day bell — an mh_activity event the notifications route surfaces to Maheen
  try {
    await sb.from("mh_activity").insert({ post_id: r.postId, actor_key: r.requestedBy, action: "date_change_requested", from_value: fmt(r.from), to_value: fmt(r.to), detail: reason });
  } catch { /* activity is best-effort */ }
  // 3) email
  if (hasEmail()) {
    try {
      await sendMail({
        to: APPROVER_EMAIL,
        subject: `Approve publish-date change — “${r.title}”`,
        text: `${who} requested to move the publish date of “${r.title}”.\n\nTask: ${r.title} (${r.type || "—"})\nAssigned to: ${nameOf(r.owner || "")}\nCreated: ${fmtDT(r.createdAt)}${creator ? ` by ${nameOf(creator)}` : ""}\nMove date: ${fmt(r.from)} -> ${fmt(r.to)}\nRequested by: ${who}\nReason: ${reason}\n\nApprove or reject it in Marketing OS (My Day -> Publish-date approvals).`,
        html: `<p><b>${who}</b> requested to move a publish date — needs your approval.</p>`
          + `<table cellpadding="4" style="font-size:14px;border-collapse:collapse">`
          + `<tr><td><b>Task</b></td><td>${r.title} <i>(${r.type || "—"})</i></td></tr>`
          + `<tr><td><b>Assigned to</b></td><td>${nameOf(r.owner || "")}</td></tr>`
          + `<tr><td><b>Created</b></td><td>${fmtDT(r.createdAt)}${creator ? ` by ${nameOf(creator)}` : ""}</td></tr>`
          + `<tr><td><b>Move date</b></td><td>${fmt(r.from)} → <b>${fmt(r.to)}</b></td></tr>`
          + `<tr><td><b>Requested by</b></td><td>${who}</td></tr>`
          + `<tr><td><b>Reason</b></td><td>${reason}</td></tr>`
          + `</table><p>Approve or reject it in <i>Marketing OS → My Day → Publish-date approvals</i>.</p>`,
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
    await postSlack(`✅ *${nameOf(opts.approverKey)}* approved the publish-date change on *“${req.title}”* → *${fmt(req.to)}*.`);
  } else {
    await postTeamMessage(sb, opts.approverKey, `⛔ ${nameOf(opts.approverKey)} kept “${req.title}” on ${fmt(req.from)} — publish-date change declined.`);
    await postSlack(`⛔ *${nameOf(opts.approverKey)}* kept *“${req.title}”* on *${fmt(req.from)}* — publish-date change declined.`);
  }

  const resolved: DateChangeRequest = { ...req, status: opts.action === "approve" ? "approved" : "rejected", resolvedBy: opts.approverKey, resolvedAt: new Date().toISOString() };
  await sb.from("discover_cache").upsert(
    { cache_key: KEY(opts.postId), source: "mh_date_change_request", last_fetched: new Date().toISOString(), payload: resolved },
    { onConflict: "cache_key" },
  );
  return { ok: true, request: resolved };
}
