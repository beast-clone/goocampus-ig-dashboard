import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSessionIsAdmin } from "@/lib/auth";
import { fetchRoster } from "@/lib/team-db";
import { noticeDate } from "@/lib/watchers";
import { safeError } from "@/lib/errors";

// GET /api/watchers/report?days=14
//   Every notice the watchers found, by day, and what was done about each one —
//   including the ones nobody touched.
//
// Admin only, for the same reason the Radar report is: it names who answered what,
// and a report everybody can read is one everybody manages the appearance of rather
// than the work.
//
// Unlike the Radar report this needs no nightly roll-off. A radar headline is a
// search result that is gone tomorrow, so it has to be written into a day log to be
// remembered; a notice is already a row in mh_watcher_items and stays one. The
// answers are read from radar_actions, which notices share with headlines.

export const dynamic = "force-dynamic";

type ItemRow = {
  id: string; watcher_id: string; item_url: string; title: string | null; grp: string | null;
  detected_at: string; emailed_at: string | null; telegram_at: string | null; summary: string | null;
};
type ActionRow = { item_key: string; action: string; actor_key: string | null; task_id: string | null; reason: string | null };

// The IST calendar day — the team's day, not UTC's.
const dayOf = (t: number) => new Date(t + 330 * 60_000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 14));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const [{ data: items }, { data: watchers }, { data: actions }] = await Promise.all([
      // Only what the watchers actually announced. The baseline — everything that was
      // already on a page the first time it was read — was never shown to anyone, so
      // holding people to account for not acting on it would be nonsense.
      sb.from("mh_watcher_items")
        .select("id, watcher_id, item_url, title, grp, detected_at, emailed_at, telegram_at, summary")
        .eq("baseline", false).gte("detected_at", since).order("detected_at", { ascending: false }),
      sb.from("mh_watchers").select("id, name, url"),
      sb.from("radar_actions").select("item_key, action, actor_key, task_id, reason"),
    ]);

    const names = Object.fromEntries((await fetchRoster()).map((u) => [u.id, u.name])) as Record<string, string>;
    const site = new Map(((watchers || []) as { id: string; name: string | null; url: string }[])
      .map((w) => [w.id, w.name || new URL(w.url).hostname.replace(/^www\./, "")]));
    const byKey = new Map(((actions || []) as ActionRow[]).map((a) => [a.item_key, a]));

    const rows = (items || []) as ItemRow[];
    const byDay = new Map<string, ItemRow[]>();
    for (const r of rows) {
      const d = dayOf(Date.parse(r.detected_at));
      byDay.set(d, [...(byDay.get(d) || []), r]);
    }

    const out = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, list]) => {
      const withAction = list.map((r) => {
        const a = byKey.get(`notice:${r.item_url}`);
        const posted = noticeDate(r.title, r.item_url);
        return {
          itemKey: `notice:${r.item_url}`,
          title: r.title || r.item_url,
          url: r.item_url,
          group: r.grp || "Other",
          site: site.get(r.watcher_id) || "",
          summary: r.summary,
          foundAt: r.detected_at,
          postedAt: posted,
          // How long the notice existed before we saw it. Null when the notice carries
          // no date of its own — guessing would make the worst number the least true.
          lagMins: posted ? Math.max(0, Math.round((Date.parse(r.detected_at) - Date.parse(posted)) / 60_000)) : null,
          emailed: !!r.emailed_at,
          telegram: !!r.telegram_at,
          action: a?.action || null,
          reason: a?.reason || null,
          by: a?.actor_key ? (names[a.actor_key] || a.actor_key) : null,
          taskId: a?.task_id || null,
        };
      });
      return {
        day,
        found: withAction.length,
        written: withAction.filter((r) => r.action === "written").length,
        useful: withAction.filter((r) => r.action === "useful").length,
        notUseful: withAction.filter((r) => r.action === "not_useful").length,
        noAction: withAction.filter((r) => !r.action).length,
        // Found, and nobody was told — email and Telegram both silent. The one failure
        // that makes every other number on the page meaningless.
        toldNobody: withAction.filter((r) => !r.emailed && !r.telegram).length,
        items: withAction,
      };
    });

    return NextResponse.json({ days: out, since });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load the watchers report"), { status: 502 });
  }
}
