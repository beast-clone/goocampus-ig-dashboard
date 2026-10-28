import { NextResponse } from "next/server";
import { requireSection, requireSchedulerPages } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { freshPublishState, NOT_PUBLISHING } from "@/lib/scheduler-lock";
import { logQueueAction, istTime } from "@/lib/publish-history";
import { trashTasks } from "@/lib/task-trash";
import { getSessionUserId } from "@/lib/auth";

// POST /api/scheduler/enqueue
// Puts a post into the Supabase publish QUEUE (mh_posts). This does NOT publish to
// Meta — it only sets publish_status='scheduled' + schedule_time. A separate worker
// (Phase 4b: app-direct for "now", n8n for scheduled/video) is what actually posts.
// Nothing goes live until that worker exists, so this endpoint is safe on its own.
//
//  • taskId present  → UPDATE that Output-Ready row (it then leaves "To schedule")
//  • taskId absent   → INSERT a new manual post

type Body = {
  taskId?: string;
  particulars?: string;
  publishTo?: string;          // channel: Instagram/Facebook/both
  publishToPage?: string;      // primary account
  pages?: string[];            // optional cross-post accounts (defaults to [publishToPage])
  caption?: string;
  mediaUrls?: string[];
  collaborators?: string[];    // Instagram usernames to auto-invite (max 3)
  format?: string;             // "post" | "reel" | "story" — what the publisher should build
  coverUrl?: string;           // reel cover image, already uploaded
  channels?: string[];         // ["instagram","facebook"] — which of Meta's two
  captionFb?: string;          // a different caption for Facebook, when asked for
  draft?: boolean;             // park it; the worker only picks up "scheduled"
  sbu?: string;                // brand / business unit — the calendar's "Interest"
  scheduleTimeISO?: string;    // absent/empty → publish "now" (schedule_time = now)
  alsoStory?: boolean;         // also post the same single photo / reel as a Story
};

type Sb = NonNullable<ReturnType<typeof getSupabase>>;

// "Also share as a Story" (Praveen, 27 Oct — like Meta's own scheduler). The Story is
// its own queue row beside the post: same file, pages, networks and time, so the
// publisher (which already posts IG + FB stories) sends both in the same run.
// Instagram and Facebook only — LinkedIn has no Stories. Re-queueing the post updates
// its Story instead of adding another; unticking bins a Story that hasn't gone out.
async function syncStory(sb: Sb, postId: string, want: boolean, row: Record<string, unknown>, title: string, when: string, draft: boolean) {
  const { data: found } = await sb.from("mh_posts").select("id, publish_status").eq("custom->>story_of", postId).limit(5);
  const open = (found || []).find((r) => r.publish_status !== "published" && r.publish_status !== "publishing");
  if (!want) {
    if (open) await trashTasks(sb, [open.id], (getSessionUserId() || "scheduler").toLowerCase());
    return;
  }
  // Already out (or going out right now) — never post the same Story twice.
  if (!open && (found || []).length) return;
  if (open) {
    const { error } = await sb.from("mh_posts").update(row).eq("id", open.id).or(NOT_PUBLISHING);
    if (error) throw new Error(`story: ${error.message}`);
    await logQueueAction(sb, open.id, draft ? "publish_draft_saved" : when === "now" ? "publish_now" : "publish_scheduled", null, istTime(String(row.schedule_time)));
    return;
  }
  const { data, error } = await sb.from("mh_posts").insert({
    particulars: `${title} · Story`.slice(0, 200),
    status: "Ready to Publish",
    needs_review: false,
    synced_to_scheduler: false,
    type: "Story",
    ...row,
  }).select("id").single();
  if (error) throw new Error(`story: ${error.message}`);
  await logQueueAction(sb, data.id, draft ? "publish_draft_saved" : when === "now" ? "publish_now" : "publish_scheduled", null, istTime(String(row.schedule_time)));
}

// Instagram allows up to 3 collaborators; normalise (strip leading @, blanks) and cap.
function cleanCollaborators(raw?: string[]): string[] | null {
  if (!raw) return null;
  const list = raw
    .map((s) => (s || "").trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, ""))
    .filter(Boolean)
    .slice(0, 3);
  return list.length ? list : null;
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json()) as Body;
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const scheduleTime = b.scheduleTimeISO && b.scheduleTimeISO.trim() ? b.scheduleTimeISO : new Date().toISOString();
    const when: "now" | "scheduled" = b.scheduleTimeISO && b.scheduleTimeISO.trim() ? "scheduled" : "now";
    const pages = (b.pages && b.pages.length ? b.pages : (b.publishToPage ? [b.publishToPage] : [])).filter(Boolean);
    let media = (b.mediaUrls || []).filter((u) => u && u.trim());
    const __pages = await requireSchedulerPages(pages);
    if (__pages) return __pages;

    // Format and cover ride in `custom` (jsonb), which mh_posts already carries for
    // fields outside the fixed schema. No migration, and the publisher reads the row
    // whole. NOT the `type` column: that is the Marketing Hub's editorial type and
    // already holds things like "Reel Thumbnail" and "YouTube Long-Form".
    const format = b.format === "reel" ? "reel" : b.format === "story" ? "story" : "post";
    const cover = (b.coverUrl || "").trim();

    // Empty or missing channels means both, which is what every post did before this
    // existed — an old row must not suddenly publish nowhere.
    let channels = (b.channels || []).filter((c) => c === "instagram" || c === "facebook");
    // Which files go where (Praveen, 28 Oct). Facebook can't take a carousel with video
    // slides (it posts a still instead):
    //   - video slides AND pictures = two versions of one post: the videos are the
    //     Instagram carousel (media_urls), the pictures go to Facebook (custom.media_fb);
    //   - several videos only = Instagram only;
    //   - several pictures = the same set to both; Facebook posts them all as one
    //     multi-photo post (custom.media_fb), not just the first picture.
    const isVideo = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
    const vids = media.filter(isVideo), pics = media.filter((u) => !isVideo(u));
    let mediaFb: string[] | null = null;
    if (vids.length && pics.length) { media = vids; mediaFb = pics; }
    else if (vids.length > 1) channels = ["instagram"];
    else if (pics.length > 1) mediaFb = pics;
    if (media.length > 10 || (mediaFb && mediaFb.length > 10)) return NextResponse.json({ error: "Instagram and Facebook take at most 10 slides — remove some and try again." }, { status: 400 });
    const fbCaption = (b.captionFb || "").trim();
    const customPatch = {
      publish_format: format,
      cover_url: cover || null,
      channels: channels.length ? channels : ["instagram", "facebook"],
      caption_fb: fbCaption || null,
      media_fb: mediaFb,
    };

    const sbu = (b.sbu || "").trim();

    const common = {
      // Only written when the composer actually collected one — an empty string
      // would wipe the brand off a row that already had it.
      ...(sbu ? { sbu } : {}),
      caption: b.caption || null,
      media_urls: media.length ? media : null,
      publish_to: b.publishTo || null,
      publish_to_pages: pages.length ? pages : null,
      collaborators: cleanCollaborators(b.collaborators),
      schedule_time: scheduleTime,
      publish_status: (b.draft ? "draft" : "scheduled") as "draft" | "scheduled",
    };

    // A Story is one photo or one video, and only a feed post or reel gets one beside it.
    const wantStory = !!b.alsoStory && (format === "post" || format === "reel") && media.length === 1;
    const storyFor = (postId: string) => syncStory(sb, postId, wantStory, {
      ...common,
      collaborators: null,   // Stories can't carry collaborators
      custom: { publish_format: "story", cover_url: null, channels: customPatch.channels, caption_fb: null, story_of: postId },
    }, (b.particulars || "Post").trim(), when, !!b.draft);

    if (b.taskId) {
      // Merge into whatever custom already holds. An Output-Ready row can carry other
      // custom fields (claim_role, and any column the Marketing Hub has added), and
      // replacing the object outright would quietly delete them.
      const { data: existing } = await sb.from("mh_posts").select("custom, publish_status, media_urls, caption").eq("id", b.taskId).maybeSingle();
      // Never re-queue a post the publisher is sending right now — that is a double post.
      if (existing?.publish_status === "publishing") return NextResponse.json({ error: "It's being published right now — wait a minute, then refresh.", publishing: true }, { status: 409 });
      // Forget what already went out only when the post itself changed. Re-queueing the
      // same post (taken out after Instagram went and Facebook failed) must not post
      // Instagram a second time (22 Oct review).
      const newVersion = JSON.stringify(existing?.media_urls || []) !== JSON.stringify(media.length ? media : [])
        || (existing?.caption || "") !== (b.caption || "");
      const merged = { ...freshPublishState(existing?.custom, newVersion), ...customPatch };
      const { data, error } = await sb.from("mh_posts").update({ ...common, custom: merged }).eq("id", b.taskId).or(NOT_PUBLISHING).select("id").single();
      if (error) throw new Error(error.message);
      await logQueueAction(sb, data.id, b.draft ? "publish_draft_saved" : when === "now" ? "publish_now" : "publish_scheduled", null, istTime(scheduleTime));
      await storyFor(data.id);
      return NextResponse.json({ ok: true, id: data.id, when: b.draft ? "draft" : when, scheduleTime, mode: "updated", story: wantStory });
    }

    // New manual post
    if (!b.particulars || !b.particulars.trim()) {
      return NextResponse.json({ error: "particulars (title) is required for a new post" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("mh_posts")
      .insert({
        particulars: b.particulars.trim(),
        status: "Ready to Publish",   // content-workflow status (enum)
        needs_review: false,
        synced_to_scheduler: false,
        // Only for a reel or a story, and only on a new row — `type` is the
        // Marketing Hub's editorial type and an existing one is not ours to
        // overwrite.
        ...(format === "reel" ? { type: "Reel" } : format === "story" ? { type: "Story" } : {}),
        custom: customPatch,
        ...common,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logQueueAction(sb, data.id, b.draft ? "publish_draft_saved" : when === "now" ? "publish_now" : "publish_scheduled", null, istTime(scheduleTime));
    if (wantStory) await storyFor(data.id);
    return NextResponse.json({ ok: true, id: data.id, when, scheduleTime, mode: "inserted", story: wantStory });
  } catch (err) {
    return NextResponse.json(safeError(err, "Enqueue failed"), { status: 502 });
  }
}
