import type { SupabaseClient } from "@supabase/supabase-js";

// A creative changed on a post that had already passed Content Review goes back to
// Content Review (Praveen, 22 Oct): otherwise a swapped video goes out without
// anyone having looked at it. "Approved" = status Ready to Publish, or sitting in the
// Scheduler queue (scheduled / failed / draft). Never while the publisher is sending
// it, and never once it is live. Caption edits don't count — only the creative.
//
// The post drops out of the queue (its time is cleared), is flagged so Content Review
// can say why it is back, and the move is written to the task's history.
export async function sendBackForReview(sb: SupabaseClient, postId: string, actor: string | null, file: string | null) {
  const { data } = await sb.from("mh_posts").select("status, publish_status, schedule_time, custom").eq("id", postId).maybeSingle();
  if (!data) return false;
  const queued = data.publish_status === "scheduled" || data.publish_status === "failed" || data.publish_status === "draft";
  if (data.status !== "Ready to Publish" && !queued) return false;

  const custom = { ...((data.custom as Record<string, unknown>) || {}), changed_after_approval: new Date().toISOString() };
  const { data: moved } = await sb.from("mh_posts")
    .update({ status: "Output - Ready", publish_status: null, schedule_time: null, failure_reason: null, custom })
    .eq("id", postId)
    .or("publish_status.is.null,publish_status.in.(scheduled,failed,draft)")
    .select("id");
  if (!moved?.length) return false;

  const when = data.schedule_time
    ? ` It was due to go out ${new Date(data.schedule_time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} — schedule it again once approved.`
    : "";
  await sb.from("mh_activity").insert({
    post_id: postId, actor_key: actor, action: "sent_back_for_review",
    from_value: data.status, to_value: "Output - Ready",
    detail: `Creative changed after approval${file ? ` (${file})` : ""} — needs review again.${when}`,
  });
  return true;
}
