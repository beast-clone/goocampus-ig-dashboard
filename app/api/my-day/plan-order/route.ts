import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { todayIST } from "@/lib/attendance";

// The order someone has dragged today's plan into.
//
// Spec §11: "persist the manual order so it isn't auto-re-sorted". Until now a drag
// lived in React state alone — reload and the day snapped back, which made the
// whole feature pointless.
//
// It is a list of task ids per person per day, nothing more. The timeline still
// derives times, lunch and capacity itself; this only says what comes first.
// A task that has since gone (published, reassigned) simply isn't found and the
// rest keep their order, so a stale list can never hide work.
//
// Stored in discover_cache, the project's key-value table, so no migration is
// needed — the same trick the WhatsApp recipients and comments use.
//
//   GET  ?person=praveen         -> { order: string[] }
//   POST { person, order }       -> { ok: true }

export const dynamic = "force-dynamic";

const SOURCE = "myday_plan_order";
const KEY = (person: string, date: string) => `${SOURCE}:${person}:${date}`;

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const person = (new URL(req.url).searchParams.get("person") || "").toLowerCase().trim();
    if (!person) return NextResponse.json({ order: [] });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ order: [] });
    const { data } = await sb
      .from("discover_cache").select("payload")
      .eq("cache_key", KEY(person, todayIST())).maybeSingle();
    const order = (data?.payload as { order?: string[] } | null)?.order;
    return NextResponse.json({ order: Array.isArray(order) ? order : [] });
  } catch (err) {
    // An order we can't read is not worth failing the page over — the plan just
    // falls back to its natural sequence.
    return NextResponse.json({ order: [], error: safeError(err, "could not read the order") });
  }
}

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json()) as { person?: string; order?: string[] };
    const person = (b.person || "").toLowerCase().trim();
    const order = (b.order || []).filter((x) => typeof x === "string").slice(0, 200);
    if (!person) return NextResponse.json({ error: "person is required" }, { status: 400 });
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
    const date = todayIST();
    await sb.from("discover_cache").upsert(
      { cache_key: KEY(person, date), source: SOURCE, last_fetched: new Date().toISOString(), payload: { person, date, order } },
      { onConflict: "cache_key" },
    );
    return NextResponse.json({ ok: true, saved: order.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "could not save the order"), { status: 502 });
  }
}
