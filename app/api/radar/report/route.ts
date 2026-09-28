import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getSessionIsAdmin } from "@/lib/auth";
import { fetchRoster } from "@/lib/team-db";

// GET /api/radar/report?days=14
//   The accountability report: every day the Radar was closed, what it showed, and what
//   was done about each item — including the ones nothing was done about.
//
// Admin only. This says who ignored what, so it is Maheen's screen; the point of it is
// oversight, and a report everybody can read is one everybody manages the appearance of
// rather than the work.

export const dynamic = "force-dynamic";

type Row = {
  day: string; item_key: string; item_kind: string; title: string;
  source: string | null; url: string | null; interest: string | null;
  time_sensitive: boolean; action: string | null; actor_key: string | null; task_id: string | null;
  reason: string | null; created_at: string;
};

export async function GET(req: Request) {
  // Full names from the Team page roster (was lib/users.ts, which misses newcomers).
  const fullNames = Object.fromEntries((await fetchRoster()).map((u) => [u.id, u.name])) as Record<string, string>;
  if (!getSessionIsAdmin()) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 14));
    const from = new Date(Date.now() + 5.5 * 3_600_000 - (days - 1) * 86_400_000).toISOString().slice(0, 10);

    const { data, error } = await sb
      .from("radar_day_log")
      .select("day, item_key, item_kind, title, source, url, interest, time_sensitive, action, actor_key, task_id, reason, created_at")
      .gte("day", from)
      .order("day", { ascending: false })
      .order("action", { ascending: true, nullsFirst: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });

    const rows = (data as Row[] | null) || [];

    // Grouped by day, because that is the unit people remember: "what did we do on
    // Friday" is answerable, "item 41 of 260" is not.
    const byDay = new Map<string, Row[]>();
    for (const r of rows) {
      const list = byDay.get(r.day) || [];
      list.push(r);
      byDay.set(r.day, list);
    }

    const out = Array.from(byDay.entries()).map(([day, list]) => ({
      day,
      shown: list.length,
      written: list.filter((r) => r.action === "written").length,
      useful: list.filter((r) => r.action === "useful").length,
      notUseful: list.filter((r) => r.action === "not_useful").length,
      noAction: list.filter((r) => !r.action).length,
      // Called out on its own line because this is the number that matters: a deadline
      // story nobody touched is a lost post, where an evergreen one is only a delay.
      missedUrgent: list.filter((r) => !r.action && r.time_sensitive).length,
      items: list.map((r) => ({
        itemKey: r.item_key, kind: r.item_kind, title: r.title,
        source: r.source, url: r.url, interest: r.interest,
        timeSensitive: r.time_sensitive,
        action: r.action,
        // Why it was turned down, when somebody said. Optional by design — see sql/025.
        reason: r.reason,
        // A name, not an id — the report is read by a person.
        by: r.actor_key ? (fullNames[r.actor_key] || r.actor_key) : null,
        taskId: r.task_id,
      })),
    }));

    return NextResponse.json({ days: out, from });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load the radar report"), { status: 502 });
  }
}
