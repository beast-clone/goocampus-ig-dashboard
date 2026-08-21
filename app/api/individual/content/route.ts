import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";

// The logged-in person's own tasks, read from the SAME table the main-dashboard
// Marketing Hub uses (mh_posts), filtered to their owner_key. Because it's the same
// source, every row carries a real mh_posts.id — so a row on /me can deep-link
// straight to its task detail in the Hub (/dashboard/marketing-hub?open=<id>).
export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  const sb = getSupabase();
  const uid = getSessionUserId();
  if (!sb || !uid) return NextResponse.json({ items: [] });
  const { data, error } = await sb
    .from("mh_posts")
    .select("id,airtable_record_id,particulars,type,status,sbu,platforms,publishing_date,output_link")
    .eq("owner_key", uid)
    .order("publishing_date", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return NextResponse.json({ items: [], error: error.message });
  // Thumbnail tasks (auto-assigned per reel / YouTube video by the spawn_thumbnail
  // trigger) are real work for the designer/editor — show them like any other task.
  const items = (data ?? []).map((p) => ({
    id: p.id, // mh_posts.id — used for the deep-link
    title: p.particulars ?? "",
    type: p.type ?? "",
    status: p.status ?? "",
    sbu: p.sbu ?? "",
    platforms: p.platforms ?? [],
    publish_date: p.publishing_date ?? null,
    output_link: p.output_link ?? null,
  }));
  return NextResponse.json({ items });
}
