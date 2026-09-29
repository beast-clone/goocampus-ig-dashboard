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
//   PATCH  /api/benchmark/tracked  { accountId, handle, platform?, name?, website?, youtube?, sbu? }
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
  name?: string | null; website?: string | null;
};

// Handles are stored lower-cased and without the @, so "@HelloMentor.in" and
// "hellomentor.in" are one row and the unique index can match exactly.
const normHandle = (h: unknown) => String(h || "").replace(/^@/, "").trim().toLowerCase();
// A website is kept only if it looks like one; a bare domain gets https:// added.
function normWebsite(w: unknown): string | null {
  const v = String(w || "").trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try { const u = new URL(withScheme); return u.hostname.includes(".") ? u.origin + u.pathname.replace(/\/$/, "") : null; } catch { return null; }
}

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const accountId = new URL(req.url).searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ available: false, items: [], reason: "Supabase not configured" });
  const { data, error } = await db
    .from(TABLE)
    .select("handle, platform, category, sbu, period, youtube_channel, name, website")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) {
    if (MISSING.has(error.code)) return NextResponse.json({ available: false, items: [], reason: "sql/029_competitors.sql hasn't been run yet" });
    return NextResponse.json(safeError(error, "Couldn't read the tracked competitors"), { status: 502 });
  }
  const items = ((data || []) as (TrackedRow & { youtube_channel?: string | null })[])
    .map(({ youtube_channel, ...r }) => ({ ...r, youtube: youtube_channel ?? null }));
  return NextResponse.json({ available: true, items });
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
    handle: normHandle(x.handle),
    platform: (x.platform === "youtube" ? "youtube" : "instagram"),
    category: x.category?.trim() || null,
    sbu: x.sbu?.trim() || null,
    youtube_channel: x.youtube?.trim() || null,
    name: x.name?.trim() || null,
    website: normWebsite(x.website),
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

/** Edit one competitor — name, website, YouTube channel, primary interest. */
export async function PATCH(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  let b: { accountId?: string; handle?: string; platform?: string; name?: string; website?: string; youtube?: string; sbu?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const handle = normHandle(b.handle);
  if (!b.accountId || !handle) return NextResponse.json({ error: "accountId and handle required" }, { status: 400 });
  const patch: Record<string, string | null> = {};
  if ("name" in b) patch.name = b.name?.trim() || null;
  if ("website" in b) {
    const w = normWebsite(b.website);
    if (b.website?.trim() && !w) return NextResponse.json({ error: "That doesn't look like a website address." }, { status: 400 });
    patch.website = w;
  }
  if ("youtube" in b) patch.youtube_channel = b.youtube?.trim() || null;
  if ("sbu" in b) patch.sbu = b.sbu?.trim() || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to change" }, { status: 400 });
  const { error } = await db.from(TABLE).update(patch)
    .eq("account_id", b.accountId).eq("platform", b.platform === "youtube" ? "youtube" : "instagram").eq("handle", handle);
  if (error) return NextResponse.json(safeError(error, "Couldn't save the change"), { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const handle = normHandle(url.searchParams.get("handle"));
  const platform = url.searchParams.get("platform") || "instagram";
  if (!accountId || !handle) return NextResponse.json({ error: "accountId and handle required" }, { status: 400 });

  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { error } = await db.from(TABLE).delete()
    // Exact match: ilike treated "_" as a wildcard, so removing "hello_mentor" could
    // also remove "hello-mentor".
    .eq("account_id", accountId).eq("platform", platform).eq("handle", handle);
  if (error) {
    if (MISSING.has(error.code)) return NextResponse.json({ available: false }, { status: 503 });
    return NextResponse.json(safeError(error, "Couldn't remove the competitor"), { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
