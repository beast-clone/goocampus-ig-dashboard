import { getSupabase } from "@/lib/supabase";

// What people did about the things Content Radar showed them — see
// sql/022_radar_report.sql for why this is split from the day log.
//
// The radar used to show things and record nothing, so "we decided not to post that"
// and "nobody looked" were indistinguishable. Thumbs exist for exactly that reason:
// "not useful" is a real answer and takes one tap, where writing the post is the only
// other way to clear something — and if that is the only way, people ignore the tab.

// "notice" is a counselling notice found by a Watcher. It lives here, not in a
// table of its own, because the question asked of it is identical and a second
// copy of this would drift from the first.
export type RadarItemKind = "news" | "mention" | "search" | "review" | "notice";
export type RadarAction = "written" | "useful" | "not_useful";

/** A stable identity for the thing that was shown, whatever kind it is. Most of these
 *  never exist as rows here — a Reddit thread, a search term and a Google review are all
 *  passing through — so the key is derived rather than referenced. */
export function radarItemKey(kind: RadarItemKind, raw: string): string {
  return kind === "search" ? `search:${raw.trim().toLowerCase()}` : `${kind}:${raw.trim()}`;
}

export async function recordRadarAction(args: {
  itemKey: string;
  itemKind: RadarItemKind;
  action: RadarAction;
  actorKey: string | null;
  taskId?: string | null;
  /** Why it was turned down. Always optional — see sql/025. */
  reason?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase not configured" };

  // One standing answer per person per item: changing your mind updates rather than
  // leaving both answers for the report to choose between.
  const { error } = await sb.from("radar_actions").upsert(
    {
      item_key: args.itemKey,
      item_kind: args.itemKind,
      action: args.action,
      actor_key: args.actorKey,
      task_id: args.taskId || null,
      reason: args.reason?.trim() ? args.reason.trim().slice(0, 300) : null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "item_key,actor_key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type RadarActionRow = { item_key: string; action: RadarAction; actor_key: string | null; task_id: string | null; reason: string | null };

/** Every action taken so far, by item. The radar reads this to show what it already
 *  knows, so a thumb stays pressed across a reload instead of looking un-saved. */
export async function actionsByItem(): Promise<Record<string, RadarActionRow>> {
  const sb = getSupabase();
  if (!sb) return {};
  const { data } = await sb.from("radar_actions").select("item_key, action, actor_key, task_id, reason");
  const out: Record<string, RadarActionRow> = {};
  for (const r of (data as RadarActionRow[] | null) || []) out[r.item_key] = r;
  return out;
}

/** Items already written into a past day's log. The radar hides these: a thing is
 *  shown for its day and then belongs to the report, which is what stops the tab
 *  becoming an ever-growing pile nobody can finish. */
export async function loggedKeys(): Promise<Set<string>> {
  const sb = getSupabase();
  if (!sb) return new Set();
  const { data } = await sb.from("radar_day_log").select("item_key");
  return new Set(((data as { item_key: string }[] | null) || []).map((r) => r.item_key));
}

/** Un-tapping a thumb. The row is deleted rather than set to a "none" value, so the
 *  report's meaning of "no action" stays one thing: no row. */
export async function clearRadarAction(itemKey: string, actorKey: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase not configured" };
  let q = sb.from("radar_actions").delete().eq("item_key", itemKey);
  q = actorKey ? q.eq("actor_key", actorKey) : q.is("actor_key", null);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
