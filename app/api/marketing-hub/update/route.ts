import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// PATCH /api/marketing-hub/update
// Updates ONE row in mh_posts (Supabase). Whitelist of fields to prevent
// clients from overwriting anything they shouldn't.

type UpdateBody = {
  id: string;
  fields: Partial<{
    particulars: string;
    type: string;
    status: string;
    sbu: string;
    owner_key: string | null;
    publishing_date: string | null;
    due_date: string | null;
    priority: string;
    platforms: string[];
    content: string;
    caption: string;
    needs_review: boolean;
    output_link: string;
    additional_info: string;
  }>;
};

const ALLOWED_FIELDS = [
  "particulars", "type", "status", "sbu", "owner_key",
  "publishing_date", "due_date", "priority", "platforms",
  "content", "caption", "needs_review", "output_link",
  "additional_info",
] as const;

const OWNER_ALIASES: Record<string, string> = {
  "manya b m": "manya", "manya": "manya",
  "praveen l": "praveen", "praveen": "praveen",
  "nikhil shyamraj": "nikhil", "nikhi shyamraj": "nikhil", "nikhil": "nikhil",
  "nandu c": "nandu", "nandu": "nandu",
  "maheen ejaz": "maheen", "maheen": "maheen",
};

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as UpdateBody;
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!body.fields || Object.keys(body.fields).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    // Whitelist and normalize
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.fields)) {
      if (!(ALLOWED_FIELDS as readonly string[]).includes(k)) continue;
      if (k === "owner_key" && typeof v === "string") {
        const mapped = OWNER_ALIASES[v.toLowerCase().trim()];
        clean[k] = mapped || v; // let Postgres FK enforce if invalid
      } else {
        clean[k] = v;
      }
    }

    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: "no allowed fields to update" }, { status: 400 });
    }

    // Grab the row BEFORE update so we can detect a status transition into "Content - Approved"
    const before = await sb.from("mh_posts").select("id, status, type, owner_key").eq("id", body.id).single();
    if (before.error) throw new Error(before.error.message);

    const { data, error } = await sb
      .from("mh_posts")
      .update(clean)
      .eq("id", body.id)
      .select("id, particulars, status, type, owner_key, updated_at")
      .single();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "row not found" }, { status: 404 });

    // Auto-handoff when status becomes "Content - Approved":
    //   • Design/static work (post, carousel, thumbnail, static Meta Ads, story-image…)
    //     → auto-assigned to Praveen; the writer stays as a collaborator.
    //   • Video work (reels, YouTube long-form/shorts, story-video, Meta Ads - Video)
    //     → NOT auto-assigned; it becomes claimable by an editor (Nikhil/Nandu) via
    //       the Claim button. Whoever claims becomes owner (takeover route).
    //   • The writer (Manya) is added as collaborator; Maheen is NEVER auto-added.
    const VIDEO_TYPES = new Set([
      "Reel - Original", "Reel - Cut", "YouTube Long-Form", "YouTube Shorts",
      "Story (Video)", "Meta Ads - Video",
    ]);
    if (
      clean.status === "Content - Approved" &&
      before.data.status !== "Content - Approved"
    ) {
      const type = String(data.type || "");
      const isVideo = VIDEO_TYPES.has(type);
      const oldOwner = before.data.owner_key; // the writer (Manya)

      if (!isVideo) {
        // Design → hand to Praveen; writer joins as collaborator (never Maheen).
        if (data.owner_key !== "praveen") {
          await sb.from("mh_posts").update({ owner_key: "praveen" }).eq("id", body.id);
        }
        if (oldOwner && oldOwner !== "praveen" && oldOwner !== "maheen") {
          await sb.from("mh_post_collaborators").upsert(
            [{ post_id: body.id, member_key: oldOwner }],
            { onConflict: "post_id,member_key", ignoreDuplicates: true },
          );
        }
        await sb.from("mh_activity").insert({
          post_id: body.id,
          actor_key: oldOwner || null,
          action: "handoff",
          detail: "approved — handed to Praveen",
        });
      } else {
        // Video → stays with the writer, now open for an editor to claim.
        await sb.from("mh_activity").insert({
          post_id: body.id,
          actor_key: oldOwner || null,
          action: "handoff",
          detail: "approved — ready for an editor to claim",
        });
      }
    }

    return NextResponse.json({ id: data.id, fields: data, updatedAt: data.updated_at });
  } catch (err) {
    return NextResponse.json(safeError(err, "Task update failed"), { status: 502 });
  }
}
