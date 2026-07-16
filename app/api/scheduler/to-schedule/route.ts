import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// GET /api/scheduler/to-schedule
// The "To schedule" tab: content that's produced and awaiting a publish action —
// mh_posts rows whose content-workflow status is Output-Ready or Ready-to-Publish
// (and not yet handed to the publish queue). Supabase-native, no Airtable.

// Never cache — must reflect enqueue writes immediately (a just-scheduled post
// should drop off this list on the next refresh).
export const dynamic = "force-dynamic";

const READY_STATUSES = ["Output - Ready", "Ready to Publish"];

// Best-effort default IG/FB account from the content's SBU (interest). The person
// can override + cross-post; this just pre-selects the obvious one.
function defaultPageForSbu(sbu: string | null): string {
  const s = (sbu || "").toLowerCase();
  if (/india|neet|12th|12plus/.test(s)) return "GooCampus India";
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
      .limit(20); // testing cap — show a manageable batch, not all 41

    if (error) throw new Error(error.message);

    const posts = (data || []).map((r) => ({
      id: r.id,
      title: r.particulars,
      status: r.status,
      sbu: r.sbu,
      type: r.type,
      caption: r.caption,
      content: r.content,
      // media: prefer uploaded media (Supabase Storage); fall back to the legacy
      // Slack/output link until everything's migrated to direct upload.
      mediaUrls: (r.media_urls as string[] | null) || [],
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
