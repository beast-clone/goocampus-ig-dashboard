import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { VIDEO_TYPES } from "@/lib/mh-content-types";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { postTeamMessage, MH_NAME } from "@/lib/mh-chat";

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
    instagram_url: string;
    facebook_url: string;
    linkedin_url: string;
    reference_links: string[];
  }>;
};

const ALLOWED_FIELDS = [
  "particulars", "type", "status", "sbu", "owner_key",
  "publishing_date", "due_date", "priority", "platforms",
  "content", "caption", "needs_review", "output_link",
  "additional_info", "instagram_url", "facebook_url", "linkedin_url",
  "reference_links",
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

    // Guard the mh_status enum — a non-enum value would 502 the whole update with
    // an opaque Postgres error (and two legacy client statuses used to do exactly
    // that). Reject clearly instead.
    const VALID_STATUS = new Set([
      "Content - Pending", "Content - In Progress", "Content - Approved",
      "Incorporating Feedback", "Output - Ready", "Ready to Publish", "Published/Scheduled",
    ]);
    if (typeof clean.status === "string" && !VALID_STATUS.has(clean.status)) {
      return NextResponse.json({ error: `"${clean.status}" is not a valid status` }, { status: 400 });
    }

    // Full before-state so we can log a precise, attributed diff for every field.
    const before = await sb
      .from("mh_posts")
      .select("id, status, type, owner_key, particulars, sbu, publishing_date, due_date, priority, content, caption, additional_info, platforms, needs_review, output_link, start_at, end_at")
      .eq("id", body.id)
      .single();
    if (before.error) throw new Error(before.error.message);

    const { data, error } = await sb
      .from("mh_posts")
      .update(clean)
      .eq("id", body.id)
      .select("id, particulars, status, type, owner_key, updated_at")
      .single();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "row not found" }, { status: 404 });

    // Clear the marketing-hub read cache so this edit reflects on the next fetch
    // (drag-reschedule / inline edits would otherwise snap back until the 12h TTL).
    bustMarketingHubCache();

    // Actor = the client-supplied person (My Day passes the switched person) or the
    // logged-in session user. This is what makes the activity feed read "Praveen …".
    const bodyActor = typeof (body as { actor?: string }).actor === "string" ? (body as { actor?: string }).actor : null;
    const actor = bodyActor || getSessionUserId() || null;

    // Log every changed field with before/after + actor. Long text (content/caption)
    // stores the full old/new so the modal can render a word-level diff.
    const ACTION: Record<string, string> = {
      status: "status_changed", owner_key: "owner_changed", publishing_date: "rescheduled",
      due_date: "due_date_changed", particulars: "renamed", priority: "priority_changed",
      type: "type_changed", content: "content_edited", caption: "caption_edited",
      additional_info: "notes_edited", sbu: "sbu_changed", platforms: "platforms_changed",
      needs_review: "review_changed", output_link: "output_link_changed",
      instagram_url: "instagram_url_changed", facebook_url: "facebook_url_changed", linkedin_url: "linkedin_url_changed",
      reference_links: "reference_links_changed",
    };
    const fmtDate = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "unset");
    const asText = (field: string, v: unknown): string | null => {
      if (v === null || v === undefined || v === "") return null;
      if (field === "publishing_date" || field === "due_date") return fmtDate(v);
      if (Array.isArray(v)) return v.length ? v.join(", ") : null;
      return String(v);
    };
    const beforeRow = before.data as Record<string, unknown>;
    const activityRows = Object.keys(clean).flatMap((field) => {
      const oldV = beforeRow[field];
      const newV = clean[field];
      const same = Array.isArray(oldV) || Array.isArray(newV)
        ? JSON.stringify(oldV ?? []) === JSON.stringify(newV ?? [])
        : (oldV ?? null) === (newV ?? null);
      if (same) return [];
      return [{
        post_id: body.id,
        actor_key: actor,
        action: ACTION[field] || "edited",
        from_value: asText(field, oldV),
        to_value: asText(field, newV),
      }];
    });
    if (activityRows.length) await sb.from("mh_activity").insert(activityRows);

    // Capture the END of the task clock the first time it reaches a done state,
    // so "Time taken" = start_at → end_at reflects how long the task took.
    const DONE_STATES = new Set(["Output - Ready", "Ready to Publish", "Published/Scheduled"]);
    if (typeof clean.status === "string" && DONE_STATES.has(clean.status) && !before.data.end_at) {
      await sb.from("mh_posts").update({ end_at: new Date().toISOString() }).eq("id", body.id);
    }

    // Auto-handoff when status becomes "Content - Approved" (assignment + collaborator
    // only — the status_changed / owner_changed rows above already record it, and the
    // notifications feed derives the handoff from status_changed -> Content-Approved):
    //   • Design/static work → auto-assigned to Praveen; the writer joins as collaborator.
    //   • Video work → left with the writer, claimable by an editor (Nikhil/Nandu).
    //   • Maheen is NEVER auto-added.
    // Mirror the key pipeline moments into the team chat (kind='system') so the
    // handoff also lands as a message, not just a bell notification.
    const chatActor = actor || before.data.owner_key || "maheen";
    const title = String(data.particulars || "a task");
    if (typeof clean.status === "string" && clean.status !== before.data.status) {
      if (clean.status === "Content - Approved") {
        const isVideo = VIDEO_TYPES.has(String(data.type || ""));
        await postTeamMessage(sb, chatActor, isVideo
          ? `${MH_NAME[chatActor] || chatActor} approved “${title}” — video work, up for grabs in the editors' pool.`
          : (body as { deferHandoff?: boolean }).deferHandoff
          ? `${MH_NAME[chatActor] || chatActor} approved “${title}” — Praveen's day is full, so it's WAITING in his pipeline until he accepts.`
          : `${MH_NAME[chatActor] || chatActor} approved “${title}” — design work, handed to Praveen.`);
      } else if (clean.status === "Ready to Publish") {
        await postTeamMessage(sb, chatActor, `“${title}” is ready to publish.`);
      } else if (clean.status === "Incorporating Feedback") {
        await postTeamMessage(sb, chatActor, `${MH_NAME[chatActor] || chatActor} sent “${title}” back with feedback.`);
      }
    }

    // PIPELINE HOLD: when the assigner saw "day already full" and chose to queue it,
    // we do NOT auto-assign — the task stays with the writer, the producer gets the
    // notification/chat ping, and ownership only moves when THEY accept (takeover).
    const deferHandoff = (body as { deferHandoff?: boolean }).deferHandoff === true;
    if (clean.status === "Content - Approved" && before.data.status !== "Content - Approved" && !deferHandoff) {
      const isVideo = VIDEO_TYPES.has(String(data.type || ""));
      const oldOwner = before.data.owner_key;
      if (!isVideo) {
        if (data.owner_key !== "praveen") {
          await sb.from("mh_posts").update({ owner_key: "praveen" }).eq("id", body.id);
          await sb.from("mh_activity").insert({ post_id: body.id, actor_key: actor, action: "owner_changed", from_value: oldOwner, to_value: "praveen" });
        }
        if (oldOwner && oldOwner !== "praveen" && oldOwner !== "maheen") {
          await sb.from("mh_post_collaborators").upsert(
            [{ post_id: body.id, member_key: oldOwner }],
            { onConflict: "post_id,member_key", ignoreDuplicates: true },
          );
        }
      }
    }

    return NextResponse.json({ id: data.id, fields: data, updatedAt: data.updated_at });
  } catch (err) {
    return NextResponse.json(safeError(err, "Task update failed"), { status: 502 });
  }
}
