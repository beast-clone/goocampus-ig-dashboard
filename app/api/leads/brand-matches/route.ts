import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { fetchSbus } from "@/lib/sbus-db";
import { interestKey, isBlankInterest } from "@/lib/lead-brand";

// Marketing Leads — the interest → brand matches an admin picked once, for CRM interests
// that don't match a brand by name (docs/MARKETING_LEADS_SPEC.md). One row in
// discover_cache (no migration): { "<interest key>": "<brand>" | "" }.
export const dynamic = "force-dynamic";

const KEY = "leadbrand:matches";
const SOURCE = "lead_brand_matches";

async function read(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<Record<string, string>> {
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", KEY).maybeSingle();
  return (data?.payload as Record<string, string>) || {};
}

export async function GET() {
  const denied = await requireSection("sales");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ matches: {} });
  try {
    return NextResponse.json({ matches: await read(sb) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read brand matches"), { status: 502 });
  }
}

/** Body: { interest, brand } — brand "" means "no brand". Admin only: it moves leads in everyone's report. */
export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can match an interest to a brand." }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
  try {
    const b = (await req.json()) as { interest?: string; brand?: string };
    const key = interestKey(String(b.interest || ""));
    const brand = String(b.brand || "");
    if (isBlankInterest(key)) return NextResponse.json({ error: "That lead has no interest set — fix it in the CRM." }, { status: 400 });
    if (brand && !(await fetchSbus()).includes(brand)) return NextResponse.json({ error: "No such brand." }, { status: 400 });
    const matches = { ...(await read(sb)), [key]: brand };
    await sb.from("discover_cache").upsert(
      { cache_key: KEY, source: SOURCE, last_fetched: new Date().toISOString(), payload: matches },
      { onConflict: "cache_key" },
    );
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save the match"), { status: 400 });
  }
}
