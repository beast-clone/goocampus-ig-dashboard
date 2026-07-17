import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// GET /api/content-review
// The "Content Review" queue: produced content awaiting a final human check before
// it can be scheduled. These are mh_posts rows whose status is "Output - Ready" and
// which haven't already been pushed to the publish queue. The social-media reviewer
// then either pushes to schedule (status -> "Ready to Publish", which is the ONLY
// status the Scheduler picks up) or sends it back (status -> "Incorporating Feedback").
// Supabase-native, no Airtable.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { data, error } = await sb
      .from("mh_posts")
      .select(
        "id, particulars, status, sbu, type, owner_key, caption, content, output_link, media_urls, publishing_date, updated_at",
      )
      .eq("status", "Output - Ready")
      // don't surface anything already handed to the publish queue
      .is("publish_status", null)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) throw new Error(error.message);

    const posts = (data || []).map((r) => {
      const media = (r.media_urls as string[] | null) || [];
      return {
        id: r.id,
        title: r.particulars,
        status: r.status,
        sbu: r.sbu,
        type: r.type,
        owner: r.owner_key,
        caption: r.caption,
        content: r.content,
        mediaUrls: media,
        assetLink: r.output_link || null,
        thumbnailUrl: media[0] || null,
        // The Scheduler requires a creative, so a post with neither uploaded media
        // nor a legacy asset link can be reviewed but not yet pushed to schedule.
        hasCreative: media.length > 0 || !!r.output_link,
        publishingDate: r.publishing_date,
        updatedAt: r.updated_at,
      };
    });

    return NextResponse.json({ posts, count: posts.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load content review queue"), { status: 502 });
  }
}
