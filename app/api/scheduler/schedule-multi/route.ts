import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Cross-post fan-out (Supabase mh_posts). Given a source row id + ISO schedule time +
// list of target accounts: schedule the source row to pages[0], and clone it once per
// remaining page (same media/caption/type, different publish_to_pages). The publish
// worker then fires one post per row.
export async function POST(req: Request) {
  let body: { recordId?: string; scheduleTime?: string; pages?: string[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.recordId || typeof body.recordId !== "string") {
    return NextResponse.json({ error: "recordId required" }, { status: 400 });
  }
  if (!body.scheduleTime || Number.isNaN(Date.parse(body.scheduleTime))) {
    return NextResponse.json({ error: "scheduleTime must be a valid ISO date" }, { status: 400 });
  }
  if (!Array.isArray(body.pages) || body.pages.length === 0) {
    return NextResponse.json({ error: "pages array is required and must be non-empty" }, { status: 400 });
  }
  const ALLOWED = new Set(["GooCampus Main", "GooCampus World", "12Plus / GC India"]);
  const badPage = body.pages.find((p) => !ALLOWED.has(p));
  if (badPage) {
    return NextResponse.json({ error: `Unknown page: ${badPage}` }, { status: 400 });
  }

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
    const iso = new Date(body.scheduleTime).toISOString();
    const pages = body.pages;

    // Load the content we need to clone for the extra pages.
    const { data: src, error: e1 } = await sb
      .from("mh_posts")
      .select("particulars, status, sbu, type, caption, content, media_urls, output_link, publish_to, priority, airtable_record_id")
      .eq("id", body.recordId)
      .single();
    if (e1) throw new Error(e1.message);

    // Schedule the original row to the first page.
    const { error: e2 } = await sb
      .from("mh_posts")
      .update({ schedule_time: iso, publish_status: "scheduled", publish_to_pages: [pages[0]] })
      .eq("id", body.recordId);
    if (e2) throw new Error(e2.message);

    // Clone one row per additional page.
    const extra = pages.slice(1);
    let created = 0;
    if (extra.length) {
      const rows = extra.map((page) => ({
        ...src,
        schedule_time: iso,
        publish_status: "scheduled",
        publish_to_pages: [page],
        needs_review: false,
        synced_to_scheduler: false,
        instagram_url: null,
        facebook_url: null,
        published_at: null,
      }));
      const { data: ins, error: e3 } = await sb.from("mh_posts").insert(rows).select("id");
      if (e3) throw new Error(e3.message);
      created = ins?.length ?? 0;
    }

    return NextResponse.json({ ok: true, updated: 1, created, pages });
  } catch (err) {
    return NextResponse.json(safeError(err, "Cross-post failed"), { status: 502 });
  }
}
