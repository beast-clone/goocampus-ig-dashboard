import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";

// GET /api/my-day/logins → { date, logins: { [person_key]: minutesAfter9AM } }
//
// Today's first-login time per person (IST), from mh_attendance — the same row My Day
// writes on login. Timelines (Today's plan, Workload) start each person's day at
// max(shift start, login) instead of always at 9 AM. Deliberately just the login
// minute: the full attendance board (logouts, hours worked) stays admin-only.
export const dynamic = "force-dynamic";

const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 500 });
  const date = todayIST();
  const { data, error } = await sb.from("mh_attendance").select("person_key, login_min").eq("date", date).not("login_min", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const logins: Record<string, number> = {};
  for (const r of (data || []) as { person_key: string; login_min: number }[]) logins[r.person_key] = r.login_min;
  return NextResponse.json({ date, logins });
}
