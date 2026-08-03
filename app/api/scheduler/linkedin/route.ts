import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { orgUrnFor } from "@/lib/linkedin-publish";

// LinkedIn scheduler — a dedicated queue (table `linkedin_scheduled_posts`) that is
// fully separate from the Meta/n8n mh_posts pipeline. A cron worker
// (/api/cron/publish-linkedin) publishes rows when their time arrives.
//   POST   /api/scheduler/linkedin   { pages, text, imageUrl?, scheduleTimeISO }
//   GET    /api/scheduler/linkedin   -> recent scheduled/published rows
//   DELETE /api/scheduler/linkedin?id=..  -> cancel a still-scheduled post
export const dynamic = "force-dynamic";

const COLS = "id, pages, body, image_url, schedule_time, status, results, error, created_at, published_at";

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb.from("linkedin_scheduled_posts").select(COLS).order("schedule_time", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return NextResponse.json({ posts: data || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to load scheduled LinkedIn posts"), { status: 502 });
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { pages?: string[]; text?: string; imageUrl?: string; scheduleTimeISO?: string };
    const pages = (b.pages || []).map((p) => (p || "").trim()).filter(Boolean).filter((p) => orgUrnFor(p));
    const text = (b.text || "").trim();
    const imageUrl = (b.imageUrl || "").trim() || null;

    if (!pages.length) return NextResponse.json({ error: "pick at least one valid LinkedIn page (goocampus / world)" }, { status: 400 });
    if (!text && !imageUrl) return NextResponse.json({ error: "nothing to post (text or image required)" }, { status: 400 });

    // Absent/empty time → schedule for now (worker publishes on its next tick).
    const when = b.scheduleTimeISO ? new Date(b.scheduleTimeISO) : new Date();
    if (isNaN(when.getTime())) return NextResponse.json({ error: "invalid schedule time" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const { data, error } = await sb.from("linkedin_scheduled_posts").insert({
      pages, body: text, image_url: imageUrl, schedule_time: when.toISOString(), status: "scheduled",
    }).select(COLS).single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, post: data });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to schedule LinkedIn post"), { status: 502 });
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    // Only cancel if still scheduled — never touch an already-published row.
    const { data, error } = await sb.from("linkedin_scheduled_posts").update({ status: "canceled" }).eq("id", id).eq("status", "scheduled").select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "post not found or already published" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Failed to cancel"), { status: 502 });
  }
}
