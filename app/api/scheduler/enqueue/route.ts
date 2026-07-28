import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

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
  scheduleTimeISO?: string;    // absent/empty → publish "now" (schedule_time = now)
};

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
  try {
    const b = (await req.json()) as Body;
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const scheduleTime = b.scheduleTimeISO && b.scheduleTimeISO.trim() ? b.scheduleTimeISO : new Date().toISOString();
    const when: "now" | "scheduled" = b.scheduleTimeISO && b.scheduleTimeISO.trim() ? "scheduled" : "now";
    const pages = (b.pages && b.pages.length ? b.pages : (b.publishToPage ? [b.publishToPage] : [])).filter(Boolean);
    const media = (b.mediaUrls || []).filter((u) => u && u.trim());

    const common = {
      caption: b.caption || null,
      media_urls: media.length ? media : null,
      publish_to: b.publishTo || null,
      publish_to_pages: pages.length ? pages : null,
      collaborators: cleanCollaborators(b.collaborators),
      schedule_time: scheduleTime,
      publish_status: "scheduled" as const,
    };

    if (b.taskId) {
      const { data, error } = await sb.from("mh_posts").update(common).eq("id", b.taskId).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data.id, when, scheduleTime, mode: "updated" });
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
        ...common,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, when, scheduleTime, mode: "inserted" });
  } catch (err) {
    return NextResponse.json(safeError(err, "Enqueue failed"), { status: 502 });
  }
}
