import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { toTask, type Row } from "@/lib/my-day-task";

// GET /api/my-day/created?person=<key>&range=<key>
//
// The "Tasks I created" card, on its own. /api/my-day already returns a `created`
// list, but it is fixed at the last 60 days and rides along with a heavy composite
// call (800 working rows + 400 published + 5000 attachments). Re-running all of that
// every time someone changes the month would be wasteful, so the card owns this
// endpoint: one narrow query, only the person asking, only the window they picked.
//
// The card shows title / type / SBU / owner / status only, so no attachment or
// collaborator joins are needed — toTask's defaults cover them.
export const dynamic = "force-dynamic";

const COLS =
  "id, particulars, type, status, sbu, owner_key, priority, content, caption, media_urls, publishing_date, due_date, updated_at, reference_links, output_link, created_at, start_at, end_at, duration_min, custom, created_by, instagram_url, facebook_url";

const CREATED_RANGES = ["this-month", "last-month", "3m", "6m", "year", "all", "custom"] as const;
type CreatedRange = (typeof CREATED_RANGES)[number];

// "custom" = the last N hours or days, counted back from right now. Bounded so a typo
// (or a crafted URL) can't ask for a window that scans the whole table pretending to
// be narrow: 2 years of hours, 2 years of days.
const CUSTOM_MAX = { hours: 17_520, days: 730 };

/**
 * A range key → the [from, to) window to query, in ISO.
 * `from: null` means no lower bound ("all time"). `to` is exclusive and only set for
 * "last month", which is the one window that has an end as well as a start.
 * Calendar windows are built from the server's local clock — the same clock created_at
 * is stamped by — so "this month" means this month HERE, not in UTC.
 */
function windowFor(range: string, now = new Date(), custom?: { amount: number; unit: "hours" | "days" }): { from: string | null; to: string | null } {
  const startOfMonth = (y: number, m: number) => new Date(y, m, 1, 0, 0, 0, 0).toISOString();
  const y = now.getFullYear(), m = now.getMonth();
  switch (range) {
    case "this-month": return { from: startOfMonth(y, m), to: null };
    case "last-month": return { from: startOfMonth(y, m - 1), to: startOfMonth(y, m) };
    case "3m": return { from: startOfMonth(y, m - 2), to: null };   // this month + the 2 before it
    case "6m": return { from: startOfMonth(y, m - 5), to: null };
    case "year": return { from: new Date(y, 0, 1, 0, 0, 0, 0).toISOString(), to: null };
    case "all": return { from: null, to: null };
    case "custom": {
      // A rolling window, not a calendar one: "last 6 hours" means the last 6 hours,
      // not since 6 AM.
      if (!custom) return { from: startOfMonth(y, m - 2), to: null };
      const ms = custom.unit === "hours" ? 3_600_000 : 86_400_000;
      return { from: new Date(now.getTime() - custom.amount * ms).toISOString(), to: null };
    }
    // An unknown key falls back to the window the card opens on, rather than
    // silently returning everything.
    default: return { from: startOfMonth(y, m - 2), to: null };
  }
}

/** Read + clamp the custom window from the query string. Anything unparseable → 7 days. */
function customFrom(url: URL): { amount: number; unit: "hours" | "days" } {
  const unit = url.searchParams.get("unit") === "hours" ? "hours" : "days";
  const n = Math.floor(Number(url.searchParams.get("amount")));
  const amount = Number.isFinite(n) && n >= 1 ? Math.min(n, CUSTOM_MAX[unit]) : 7;
  return { amount, unit };
}

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const url = new URL(req.url);
    const person = (url.searchParams.get("person") || "").trim().toLowerCase();
    if (!person) return NextResponse.json({ error: "person required" }, { status: 400 });
    // An unrecognised range falls back to the card's default window rather than
    // reaching windowFor's own default by accident.
    const raw = url.searchParams.get("range") || "";
    const range: CreatedRange = (CREATED_RANGES as readonly string[]).includes(raw) ? (raw as CreatedRange) : "3m";

    const custom = range === "custom" ? customFrom(url) : undefined;
    const { from, to } = windowFor(range, new Date(), custom);
    let q = sb.from("mh_posts").select(COLS).eq("created_by", person);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lt("created_at", to);

    // Newest first, and capped: "all time" on a busy account could otherwise pull the
    // whole table into the browser. The client says so when the cap is hit rather than
    // quietly showing a partial list as if it were the total.
    const CAP = 500;
    const { data, error } = await q.order("created_at", { ascending: false }).limit(CAP + 1);
    if (error) throw new Error(error.message);

    const rows = (data || []) as Row[];
    const capped = rows.length > CAP;
    const created = rows.slice(0, CAP).map((r) => toTask(r));
    // `custom` echoes the CLAMPED values, so the client can show what was actually
    // applied when it differs from what was typed.
    return NextResponse.json({ created, range, from, to, capped, custom: custom || null });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't load the tasks you created"), { status: 502 });
  }
}
