import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { VIDEO_TYPES } from "@/lib/mh-content-types";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { postTeamMessage, MH_NAME } from "@/lib/mh-chat";
import { requireCapability } from "@/lib/api-guard";

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
  "reference_links", "duration_min",
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
    const denied = await requireCapability("edit_tasks");
    if (denied) return denied;

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

    // Keep due_date in lockstep with publishing_date. The team tracks the publishing
    // date; a due_date left behind on an edit causes a false "overdue" (see the My Day
    // card/reminder logic). If a publishing date is set without an explicit due_date in
    // the same patch, mirror it so the two can't drift apart.
    if ("publishing_date" in clean && !("due_date" in clean)) {
      clean.due_date = clean.publishing_date;
    }

    // `custom` is a jsonb bag (collaborator / claim_role / incorporating_feedback).
    // Merge, never overwrite, so setting one key doesn't drop the others.
    const customPatch = (body.fields as { custom?: Record<string, unknown> }).custom;
    if (customPatch && typeof customPatch === "object" && !Array.isArray(customPatch)) {
      const { data: cur } = await sb.from("mh_posts").select("custom").eq("id", body.id).single();
      clean.custom = { ...((cur?.custom as Record<string, unknown>) || {}), ...customPatch };
    }

    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: "no allowed fields to update" }, { status: 400 });
    }

    // Guard the mh_status enum — a non-enum value would 502 the whole update with
    // an opaque Postgres error (and two legacy client statuses used to do exactly
    // that). Reject clearly instead.
    const VALID_STATUS = new Set([
      "Content - Pending", "Content - In Progress", "Content - Approved", "Output - In Progress",
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

    // ── Completeness gates on status transitions (My Day workflow). Status is the
    // choke-point every surface (My Day / Master sheet / Content Review) goes through,
    // so enforcing here can't be bypassed. Returns 422 + a `missing` list the UI shows.
    const preRow = before.data as Record<string, unknown>;
    const newStatus = typeof clean.status === "string" ? (clean.status as string) : (preRow.status as string);
    const wasStatus = preRow.status as string;
    const eff = (field: string) => (field in clean ? clean[field] : preRow[field]);
    const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";

    // A) Content-Approved: the brief must be complete before it hands off to a producer.
    if (newStatus === "Content - Approved" && wasStatus !== "Content - Approved") {
      const missing: string[] = [];
      if (!filled(eff("content")) && !filled(eff("caption"))) missing.push("Content (the brief)");
      if (!filled(eff("sbu"))) missing.push("SBU");
      if (!filled(eff("priority"))) missing.push("Priority");
      if (!filled(eff("publishing_date"))) missing.push("Publishing date");
      const { count: collabCount } = await sb.from("mh_post_collaborators").select("member_key", { count: "exact", head: true }).eq("post_id", body.id);
      if (!(collabCount || 0)) missing.push("At least one collaborator");
      if (missing.length) return NextResponse.json({ error: "Can't approve yet — some required fields are missing.", missing, gate: "approve" }, { status: 422 });
    }

    // B) Output-Ready: there must be a deliverable — a creative file OR an output link.
    if (newStatus === "Output - Ready" && wasStatus !== "Output - Ready") {
      const { count: creativeCount } = await sb.from("mh_attachments").select("id", { count: "exact", head: true }).eq("post_id", body.id).eq("kind", "creative");
      if (!filled(eff("output_link")) && !(creativeCount || 0)) {
        return NextResponse.json({ error: "No creative uploaded — add a creative file or an output link first.", missing: ["A creative file or an output link"], gate: "output" }, { status: 422 });
      }
    }

    // C) Ready-to-Publish: the last stop before the Scheduler picks it up, so
    // everything the publish step needs must already exist — the creative itself,
    // the copy that goes out with it, and the date it's going out on. Without this
    // the Scheduler's own client-side guard was the only check, and Content Review
    // could push an empty shell straight into the queue.
    if (newStatus === "Ready to Publish" && wasStatus !== "Ready to Publish") {
      const missing: string[] = [];
      const { count: creativeCount } = await sb.from("mh_attachments").select("id", { count: "exact", head: true }).eq("post_id", body.id).eq("kind", "creative");
      if (!filled(eff("output_link")) && !(creativeCount || 0)) missing.push("A creative file or an output link");
      if (!filled(eff("caption")) && !filled(eff("content"))) missing.push("A caption (or the content to post)");
      if (!filled(eff("publishing_date"))) missing.push("Publishing date");
      if (missing.length) return NextResponse.json({ error: "Not ready to publish yet — some required fields are missing.", missing, gate: "publish" }, { status: 422 });
    }

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
    const activityRows = Object.keys(clean).filter((field) => field !== "custom").flatMap((field) => {
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
    // START the task clock the moment a producer moves it to "Output - In Progress"
    // — this stamp is what the live My Day timer counts from (planned vs on-the-clock).
    if (clean.status === "Output - In Progress" && before.data.status !== "Output - In Progress" && !before.data.start_at) {
      await sb.from("mh_posts").update({ start_at: new Date().toISOString() }).eq("id", body.id);
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
        // Add the writer as collaborator FIRST, THEN flip the owner — so a My Day poll
        // landing mid-handoff never sees owner=praveen with no collaborator yet (which
        // made the task blink off Manya's board). Now every snapshot is consistent:
        // she sees it as owner (before) or as collaborator (after).
        if (oldOwner && oldOwner !== "praveen" && oldOwner !== "maheen") {
          await sb.from("mh_post_collaborators").upsert(
            [{ post_id: body.id, member_key: oldOwner }],
            { onConflict: "post_id,member_key", ignoreDuplicates: true },
          );
        }
        if (data.owner_key !== "praveen") {
          await sb.from("mh_posts").update({ owner_key: "praveen" }).eq("id", body.id);
          await sb.from("mh_activity").insert({ post_id: body.id, actor_key: actor, action: "owner_changed", from_value: oldOwner, to_value: "praveen" });
        }
      }
    }

    return NextResponse.json({ id: data.id, fields: data, updatedAt: data.updated_at });
  } catch (err) {
    return NextResponse.json(safeError(err, "Task update failed"), { status: 502 });
  }
}
