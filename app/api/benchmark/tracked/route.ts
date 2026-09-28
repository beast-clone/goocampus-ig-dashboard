import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// The competitors a brand is tracking.
//
//   GET    /api/benchmark/tracked?accountId=goocampus
//   POST   /api/benchmark/tracked  { accountId, handle, platform?, category?, sbu?, period? }
//   POST   /api/benchmark/tracked  { accountId, items: [...] }        (bulk — used once to
//                                                                      lift a browser's old list)
//   DELETE /api/benchmark/tracked?accountId=..&handle=..&platform=..
//
// These used to live in localStorage, so they were per browser and per device —
// "I've added 2-3; now it's not there" (Nandu, 26 Sept). Now they are rows, which
// also lets the Briefing page read them and lets a competitor carry a primary
// interest (Manya, 28 Sept).
//
// `available: false` means sql/029_competitors.sql has not been run yet. The page
// falls back to its old localStorage behaviour in that case rather than breaking.
export const dynamic = "force-dynamic";

const TABLE = "mh_competitors";
// The table is not there yet — the migration has not been run. PostgREST answers
// PGRST205 ("not in the schema cache"); 42P01 is what Postgres itself would say.
const MISSING = new Set(["PGRST205", "42P01"]);

export type TrackedRow = {
  handle: string; platform: string; category: string | null; sbu: string | null; period: number; youtube?: string | null;
};

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const accountId = new URL(req.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ available: false, items: [], reason: "Supabase not configured" });
  const { data, error } = await db
    .from(TABLE)
    .select("handle, platform, category, sbu, period, youtube_channel")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) {
    if (MISSING.has(error.code)) return NextResponse.json({ available: false, items: [], reason: "sql/029_competitors.sql hasn't been run yet" });
    return NextResponse.json(safeError(error, "Couldn't read the tracked competitors"), { status: 502 });
  }
  return NextResponse.json({ available: true, items: (data || []) as TrackedRow[] });
}

export async function POST(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  let b: { accountId?: string; items?: unknown[] } & Partial<TrackedRow>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!b.accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const actor = getSessionUserId() || null;
  const clean = (x: Partial<TrackedRow>) => ({
    account_id: b.accountId!,
    // Stored without the @, so the same account typed either way is one row.
    handle: String(x.handle || "").replace(/^@/, "").trim(),
    platform: (x.platform === "youtube" ? "youtube" : "instagram"),
    category: x.category?.trim() || null,
    sbu: x.sbu?.trim() || null,
    youtube_channel: x.youtube?.trim() || null,
    period: Number(x.period) || 30,
    added_by: actor,
  });

  const rows = (Array.isArray(b.items) ? (b.items as Partial<TrackedRow>[]) : [b]).map(clean).filter((r) => r.handle);
  if (!rows.length) return NextResponse.json({ error: "no handle given" }, { status: 400 });

  const { error } = await db.from(TABLE).upsert(rows, { onConflict: "account_id,platform,handle", ignoreDuplicates: false });
  if (error) {
    if (MISSING.has(error.code)) return NextResponse.json({ available: false, error: "sql/029_competitors.sql hasn't been run yet" }, { status: 503 });
    return NextResponse.json(safeError(error, "Couldn't save the competitor"), { status: 502 });
  }
  return NextResponse.json({ ok: true, saved: rows.length });
}

export async function DELETE(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const handle = (url.searchParams.get("handle") || "").replace(/^@/, "").trim();
  const platform = url.searchParams.get("platform") || "instagram";
  if (!accountId || !handle) return NextResponse.json({ error: "accountId and handle required" }, { status: 400 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { error } = await db.from(TABLE).delete()
    .eq("account_id", accountId).eq("platform", platform).ilike("handle", handle);
  if (error) {
    if (MISSING.has(error.code)) return NextResponse.json({ available: false }, { status: 503 });
    return NextResponse.json(safeError(error, "Couldn't remove the competitor"), { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
