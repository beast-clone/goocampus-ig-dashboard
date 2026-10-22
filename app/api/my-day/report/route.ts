import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { rosterById } from "@/lib/team-db";

// GET /api/my-day/report?person=<key>&from=YYYY-MM-DD&to=YYYY-MM-DD
// "My report" (prototype D, 22 Oct): what a person finished in a date range (IST
// days), each with its start → finish and how long it took, plus what is still
// open and due by the end of the range. Anyone sees their own; an admin may ask
// for someone else's (the End-day Telegram post uses the same numbers).
export const dynamic = "force-dynamic";

const IST = "Asia/Kolkata";
const dayIST = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date(iso));
// IST midnight → UTC instant, for the query bounds.
const startOfDayUTC = (d: string) => new Date(`${d}T00:00:00+05:30`).toISOString();

export async function GET(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });

  const u = new URL(req.url);
  const meId = getSessionUserId() || "";
  const me = await rosterById(meId);
  const asked = (u.searchParams.get("person") || meId).toLowerCase();
  const person = me?.isAdmin ? asked : meId;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const today = dayIST(new Date().toISOString());
  const from = re.test(u.searchParams.get("from") || "") ? u.searchParams.get("from")! : today;
  const to = re.test(u.searchParams.get("to") || "") ? u.searchParams.get("to")! : today;
  const toNext = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString();

  const cols = "id, particulars, type, status, sbu, start_at, end_at, publishing_date, duration_min";
  const [doneRes, openRes] = await Promise.all([
    sb.from("mh_posts").select(cols).eq("owner_key", person).gte("end_at", startOfDayUTC(from)).lt("end_at", toNext).order("end_at", { ascending: true }).limit(300),
    sb.from("mh_posts").select(cols).eq("owner_key", person).in("status", ["Content - Approved", "Output - In Progress", "Incorporating Feedback"]).lte("publishing_date", to).order("publishing_date", { ascending: true }).limit(100),
  ]);
  if (doneRes.error) return NextResponse.json({ error: doneRes.error.message }, { status: 502 });

  type Row = { id: string; particulars: string | null; type: string | null; status: string; sbu: string | null; start_at: string | null; end_at: string | null; publishing_date: string | null; duration_min: number | null };
  const done = ((doneRes.data || []) as Row[]).map((r) => {
    const start = r.start_at && new Date(r.start_at) < new Date(r.end_at!) && dayIST(r.start_at) === dayIST(r.end_at!) ? r.start_at : null;
    // Wall-clock start → finish, minus the 1–2 PM lunch hour if the stretch crossed it.
    let mins: number | null = r.duration_min || null;
    if (start) {
      const a = new Date(start).getTime(), b = new Date(r.end_at!).getTime();
      const d = dayIST(start);
      const l1 = new Date(`${d}T13:00:00+05:30`).getTime(), l2 = new Date(`${d}T14:00:00+05:30`).getTime();
      const lunch = Math.max(0, Math.min(b, l2) - Math.max(a, l1));
      mins = Math.round((b - a - lunch) / 60000);
    }
    return { id: r.id, title: r.particulars || "Untitled", type: r.type || "", status: r.status, day: dayIST(r.end_at!), start, end: r.end_at, mins };
  });
  const open = ((openRes.data || []) as Row[]).map((r) => ({ id: r.id, title: r.particulars || "Untitled", type: r.type || "", status: r.status, due: r.publishing_date }));
  const totalMins = done.reduce((n, d) => n + (d.mins || 0), 0);
  return NextResponse.json({ person, from, to, done, open, totals: { completed: done.length, minutes: totalMins, open: open.length } });
}
