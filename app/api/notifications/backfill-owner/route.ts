import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { STATUS_FOR_TITLE } from "@/lib/notifications";
import { TEAM_NAMES } from "@/lib/team-names";
import { safeError } from "@/lib/errors";

// POST /api/notifications/backfill-owner
//
// Progress notifications now carry who holds the task and what it moved to, so a group
// of them can link to that person's tasks at that status. Rows written before that
// change have neither, and the sync upserts with ignoreDuplicates — existing rows are
// never revisited — so without this they would sit there as "Open" forever while every
// new one behaved differently.
//
// Derived from the same places the notification was built from: the owner from the
// task's own owner_key through the same name map, the status from the title through
// the same stage map. Nothing is parsed out of the displayed sentence.
//
// Idempotent: rows that already carry an owner are skipped. Admin only.
export const dynamic = "force-dynamic";

const nameOf = (k: string | null) => (k ? TEAM_NAMES[k.toLowerCase()] || k : "System");

export async function POST() {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const { data: rows } = await sb.from("mh_notifications")
      .select("id, title, post_id, payload")
      .eq("category", "progress").limit(1000);

    const todo = ((rows || []) as { id: string; title: string; post_id: string | null; payload: Record<string, unknown> | null }[])
      .filter((r) => r.post_id && !r.payload?.ownerKey);
    if (!todo.length) return NextResponse.json({ ok: true, updated: 0, note: "Nothing to backfill." });

    const { data: posts } = await sb.from("mh_posts")
      .select("id, owner_key").in("id", [...new Set(todo.map((r) => r.post_id!))]);
    const ownerById = new Map(((posts || []) as { id: string; owner_key: string | null }[]).map((p) => [p.id, p.owner_key]));

    let updated = 0;
    for (const r of todo) {
      const key = ownerById.get(r.post_id!);
      const owner = key ? nameOf(key) : null;
      const ownerKey = key || null;
      const statusTo = STATUS_FOR_TITLE[r.title] || null;
      if (!owner && !statusTo) continue;
      const { error } = await sb.from("mh_notifications")
        .update({ payload: { ...(r.payload || {}), ...(owner ? { owner } : {}), ...(ownerKey ? { ownerKey } : {}), ...(statusTo ? { statusTo } : {}) } })
        .eq("id", r.id);
      if (!error) updated++;
    }
    return NextResponse.json({ ok: true, updated, considered: todo.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Backfill failed"), { status: 502 });
  }
}
