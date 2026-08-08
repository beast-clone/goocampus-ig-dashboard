import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

// Authed (dashboard-only via middleware) — the Inbox reads the leads captured by the
// per-post form. Newest first.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ leads: [] });
    const { data, error } = await sb
      .from("mh_dm_leads")
      .select("id,first_name,last_name,email,phone,query,source_post,keyword,ig_username,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return NextResponse.json({ leads: data || [] });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load leads"), { status: 502 });
  }
}
