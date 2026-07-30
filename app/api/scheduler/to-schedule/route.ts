import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// GET /api/scheduler/to-schedule
// The "To schedule" tab: content that has cleared Content Review and is awaiting a
// publish action — mh_posts rows whose status is "Ready to Publish" (and not yet
// handed to the publish queue). "Output - Ready" no longer lands here directly:
// it waits in Content Review until a reviewer pushes it to schedule (which flips it
// to "Ready to Publish"), so nothing reaches the Scheduler until a human approves it.
// Supabase-native, no Airtable.

// Never cache — must reflect enqueue writes immediately (a just-scheduled post
// should drop off this list on the next refresh).
export const dynamic = "force-dynamic";

const READY_STATUSES = ["Ready to Publish"];

// Best-effort default IG/FB account from the content's SBU (interest). The person
// can override + cross-post; this just pre-selects the obvious one.
function defaultPageForSbu(sbu: string | null): string {
  const s = (sbu || "").toLowerCase();
  if (/india|neet|12th|12plus/.test(s)) return "12Plus / GC India"; // MUST match PAGE_OPTIONS value in scheduler (was "GooCampus India" → no checkbox matched, schedule-multi rejected it)
  if (/study abroad|world|australia|middle east|uae|ireland|germany|nz|new zealand/.test(s)) return "GooCampus World";
  return "GooCampus Main";
}

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { data, error } = await sb
      .from("mh_posts")
      .select("id, particulars, status, sbu, type, caption, content, output_link, media_urls, publish_to, publish_to_page, publishing_date, priority, updated_at, airtable_record_id")
      .in("status", READY_STATUSES)
      // don't re-list anything already pushed into the publish queue
      .is("publish_status", null)
      .order("updated_at", { ascending: false })
      .limit(200); // show the full backlog so the "Ready to schedule" count is real
                   // and decrements by one each time a post is scheduled

    if (error) throw new Error(error.message);

    // A creative may live in mh_attachments (uploaded via the detail modal), not
    // just media_urls / output_link. Content Review already treats an attachment as
    // a valid creative; the Scheduler must too, or a post that cleared review would
    // silently vanish here. Join creative attachments (kind != 'reference' — those
    // are input briefs) and treat their public URLs as schedulable media.
    const ids = (data || []).map((r) => r.id);
    const attByPost = new Map<string, string[]>();
    if (ids.length) {
      const { data: atts } = await sb
        .from("mh_attachments")
        .select("post_id, storage_path, kind")
        .in("post_id", ids)
        .neq("kind", "reference");
      for (const a of atts || []) {
        if (!a.storage_path) continue;
        const arr = attByPost.get(a.post_id) || [];
        arr.push(a.storage_path as string);
        attByPost.set(a.post_id, arr);
      }
    }

    const posts = (data || [])
      // Only surface rows that actually have a creative to schedule — an uploaded
      // media file (Supabase), a creative attachment, or a legacy asset link
      // (Slack/Drive). Rows with none aren't schedulable yet, so they'd only inflate
      // the count.
      .filter((r) => ((r.media_urls as string[] | null)?.length ?? 0) > 0 || (attByPost.get(r.id)?.length ?? 0) > 0 || !!r.output_link)
      .map((r) => ({
      id: r.id,
      title: r.particulars,
      status: r.status,
      sbu: r.sbu,
      type: r.type,
      caption: r.caption,
      content: r.content,
      // media: prefer uploaded media (Supabase Storage), then creative attachments,
      // then fall back to the legacy Slack/output link until everything's migrated
      // to direct upload. All are public URLs, so publish can use mediaUrls[0].
      mediaUrls: [...((r.media_urls as string[] | null) || []), ...(attByPost.get(r.id) || [])],
      assetLink: r.output_link || null,
      channel: r.publish_to || null,
      defaultPage: r.publish_to_page || defaultPageForSbu(r.sbu),
      publishingDate: r.publishing_date,
      priority: r.priority,
      updatedAt: r.updated_at,
      airtableRecordId: r.airtable_record_id || null,
    }));

    return NextResponse.json({ posts, count: posts.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load to-schedule list"), { status: 502 });
  }
}
