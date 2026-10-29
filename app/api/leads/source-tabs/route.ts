import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { DEFAULT_HIDDEN, DEFAULT_TABS, type SourceSetup } from "@/lib/lead-channel";

// Marketing Leads — which CRM lead sources show as tabs, and which are hidden so they're never
// flagged as "new" (docs/MARKETING_LEADS_SPEC.md). One row in discover_cache (no migration).
export const dynamic = "force-dynamic";

const KEY = "leadsources:tabs";
const SOURCE = "lead_source_tabs";

async function read(sb: NonNullable<ReturnType<typeof getSupabase>>): Promise<SourceSetup> {
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", KEY).maybeSingle();
  const p = data?.payload as Partial<SourceSetup> | undefined;
  return { tabs: p?.tabs ?? DEFAULT_TABS, hidden: p?.hidden ?? DEFAULT_HIDDEN };
}

export async function GET() {
  const denied = await requireSection("sales");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ tabs: DEFAULT_TABS, hidden: DEFAULT_HIDDEN });
  try {
    return NextResponse.json(await read(sb));
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read the lead source tabs"), { status: 502 });
  }
}

/** Body: { tabs: [{ source, label }], hidden: [source] } — the whole setup. Admin only: it changes the page for everyone. */
export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can change the tabs." }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
  try {
    const b = (await req.json()) as Partial<SourceSetup>;
    const clean = (v: unknown) => String(v ?? "").trim().slice(0, 80);
    const tabs = (Array.isArray(b.tabs) ? b.tabs : []).slice(0, 12)
      .map((t) => ({ source: clean(t?.source), label: clean(t?.label) || clean(t?.source) }))
      .filter((t, i, all) => t.source && all.findIndex((x) => x.source === t.source) === i);
    if (!tabs.length) return NextResponse.json({ error: "Keep at least one tab." }, { status: 400 });
    const hidden = [...new Set((Array.isArray(b.hidden) ? b.hidden : []).map(clean))]
      .filter((h) => !tabs.some((t) => t.source === h)).slice(0, 50);
    const setup: SourceSetup = { tabs, hidden };
    await sb.from("discover_cache").upsert(
      { cache_key: KEY, source: SOURCE, last_fetched: new Date().toISOString(), payload: setup },
      { onConflict: "cache_key" },
    );
    return NextResponse.json(setup);
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save the tabs"), { status: 400 });
  }
}
