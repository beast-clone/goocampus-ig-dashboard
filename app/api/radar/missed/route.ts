import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";

// GET /api/radar/missed
//   Yesterday only: the time-sensitive things the Radar showed and nobody touched.
//
// This feeds the one-line breadcrumb at the top of My Day. It asks about yesterday and
// nothing else, which is how "shown once" is enforced — there is no dismissal to store
// and no way for a miss to follow the team around for a week. Tomorrow the question is
// about today, and yesterday's misses live only in the report.
//
// Not admin-gated: the answer is "go and write this", which is the writer's job. The
// report — who ignored what, over weeks — is the admin-only one.

export const dynamic = "force-dynamic";

const MAX_SHOWN = 5;

export async function GET() {
  const __denied = await requireSection("content");
  if (__denied) return __denied;
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const istNow = Date.now() + 5.5 * 3_600_000;
    const day = new Date(istNow - 86_400_000).toISOString().slice(0, 10);

    const { data, error } = await sb
      .from("radar_day_log")
      .select("item_key, item_kind, title, source, url, action, time_sensitive")
      .eq("day", day)
      .eq("time_sensitive", true)
      .is("action", null)
      .limit(MAX_SHOWN + 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });

    const rows = (data as { item_key: string; item_kind: string; title: string; source: string | null; url: string | null }[] | null) || [];

    // The whole day's totals too, so the clean case can be stated rather than left blank.
    // "Nothing was missed" and "it failed to load" look identical otherwise, and the
    // second one quietly trains people to stop trusting the line.
    const { count: shown } = await sb.from("radar_day_log")
      .select("item_key", { count: "exact", head: true }).eq("day", day);
    const { count: written } = await sb.from("radar_day_log")
      .select("item_key", { count: "exact", head: true }).eq("day", day).eq("action", "written");

    return NextResponse.json({
      day,
      // Zero with a logged day means yesterday was clean. Zero with shown = 0 means the
      // roll-off never ran, and the breadcrumb says nothing at all rather than lying.
      missed: rows.slice(0, MAX_SHOWN).map((r) => ({
        itemKey: r.item_key, kind: r.item_kind, title: r.title, source: r.source, url: r.url,
      })),
      more: Math.max(0, rows.length - MAX_SHOWN),
      shown: shown || 0,
      written: written || 0,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't check yesterday"), { status: 502 });
  }
}
