import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// A post the n8n publisher has claimed (publish_status = 'publishing') is being sent
// to Instagram/Facebook right now. Rescheduling, re-publishing, deleting or editing it
// mid-way cannot stop that — it only leaves the row saying something other than what
// went out. A carousel was rescheduled to 7 PM while it was going live at 5:37 PM
// (NEET PG - MCC NRI rules, 21 Oct). Every queue change filters on this.
export const NOT_PUBLISHING = "publish_status.is.null,publish_status.neq.publishing";

/** Why an update matched no row: being published (409), or not there (404). */
export async function notUpdated(sb: SupabaseClient, id: string) {
  const { data } = await sb.from("mh_posts").select("publish_status").eq("id", id).maybeSingle();
  return data?.publish_status === "publishing"
    ? NextResponse.json({ error: "It's being published right now — wait a minute, then refresh.", publishing: true }, { status: 409 })
    : NextResponse.json({ error: "Post not found" }, { status: 404 });
}

// What the publisher keeps on a post between runs: the Instagram container it is
// waiting on and how many times it has checked. A post that is queued again — after a
// failure, a new creative, Try again — must start clean, or the publisher goes back to
// the OLD container (the failed 817 MB reel came back as "processing", 22 Oct).
//
// `newVersion`: the post itself changed (new creative, sent back and approved again,
// queued afresh) — also forget what already went out, so every platform gets the new
// version. Without it (Try again, reschedule, caption edit) the "already posted"
// markers stay, so a platform that went out isn't posted twice.
export function freshPublishState(custom: unknown, newVersion = false): Record<string, unknown> {
  const c = { ...((custom as Record<string, unknown>) || {}) };
  delete c.ig_creation_id;
  delete c.ig_kids;
  delete c.attempts;
  delete c.prep;      // a file sent ahead for the old version of the post
  if (newVersion) {
    delete c.ig_url_done;
    delete c.ig_media_id;
    delete c.fb_done;
    delete c.fb_ids;
  }
  return c;
}
