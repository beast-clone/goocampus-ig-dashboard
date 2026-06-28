import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Reads every lead the user has saved from the Inbox.
// Stored in `discover_cache` under cache_key `lead:<commentId>` with source='lead'.

export type SavedLead = {
  comment_id?: string;
  ig_username?: string;
  account?: string;
  comment?: string;
  mood?: string;
  post_url?: string;
  comment_time?: string;
  reason?: string;
  status?: "new" | "contacted" | "converted" | "lost";
  saved_at?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountFilter = url.searchParams.get("account") || "";

  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const t0 = Date.now();
  const { data, error } = await db
    .from("discover_cache")
    .select("payload, last_fetched")
    .eq("source", "lead")
    .order("last_fetched", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  let leads = (data || []).map((r) => r.payload as SavedLead);
  if (accountFilter) leads = leads.filter((l) => l.account === accountFilter || (l.account || "").replace(/^@/, "") === accountFilter);

  // Funnel counts (handle is normalized for matching)
  const totals = {
    saved: leads.length,
    new: leads.filter((l) => !l.status || l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    converted: leads.filter((l) => l.status === "converted").length,
    lost: leads.filter((l) => l.status === "lost").length,
  };

  // Per-brand counts
  const byBrand: Record<string, number> = {};
  for (const l of leads) {
    const k = l.account || "unknown";
    byBrand[k] = (byBrand[k] || 0) + 1;
  }

  return NextResponse.json({ leads, totals, byBrand, latencyMs: Date.now() - t0 });
}

// Update a lead's status: { commentId: string, status: "new"|"contacted"|"converted"|"lost" }
export async function PATCH(req: Request) {
  const body = await req.json() as { commentId: string; status: SavedLead["status"] };
  const db = getSupabase();
  if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  if (!body.commentId || !body.status) return NextResponse.json({ error: "Missing commentId/status" }, { status: 400 });

  const cacheKey = `lead:${body.commentId}`;
  const { data: existing } = await db.from("discover_cache").select("payload").eq("cache_key", cacheKey).maybeSingle();
  const payload = (existing?.payload as Record<string, unknown> | undefined) || {};
  const updated = { ...payload, status: body.status, updated_at: new Date().toISOString() };
  const { error } = await db.from("discover_cache").upsert(
    { cache_key: cacheKey, source: "lead", last_fetched: new Date().toISOString(), payload: updated },
    { onConflict: "cache_key" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
