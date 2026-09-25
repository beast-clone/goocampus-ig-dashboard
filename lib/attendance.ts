import { getSupabase } from "@/lib/supabase";

// Clock-in, written where the clock-in actually happens: the sign-in route.
//
// It used to be written by My Day, in the browser, which got it wrong three ways
// (measured on the live site, 25 Sep — the board read 0/5 all morning):
//
//   · it skipped ANY admin, to stop an admin previewing a teammate from stamping
//     that teammate as present. With every account set to admin for testing, that
//     meant nobody was ever recorded — and a real admin never could be.
//   · it only fired when My Day was opened. Sign in, work in another tab, and you
//     were absent all day.
//   · it read the laptop's clock, so a machine on the wrong timezone recorded the
//     wrong hour.
//
// Signing in is none of those things: it happens once, on the server, for everyone.
//
// The day runs 9 AM – 7 PM (both shifts). `login_min` is minutes from 9 AM and is
// NOT clamped to that window — someone who starts at 8:40 has a real start time of
// 8:40, and the board should say so. Only the timeline clamps, and only to draw.

const DAY_START_H = 9;

const istParts = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(d);

/** Today in IST, as YYYY-MM-DD — the attendance table's day key. */
export const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Minutes since 9 AM IST. Negative before 9, over 600 after 7 PM — both are real. */
export function loginMinIST(now = new Date()): number {
  const p = istParts(now);
  const h = Number(p.find((x) => x.type === "hour")?.value || 0);
  const m = Number(p.find((x) => x.type === "minute")?.value || 0);
  return h * 60 + m - DAY_START_H * 60;
}

/** "8:40 AM" in IST — what the board shows in the IN column. */
export function clockIST(now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true })
    .format(now)
    .replace(/ /g, " ");
}

/**
 * Stamp this person's arrival. The FIRST sign-in of the day wins: signing in again
 * from another device, or after a session expires, must not move the start time.
 *
 * Never throws — a database that is down must not stop someone signing in.
 */
export async function recordLogin(personKey: string, now = new Date()): Promise<void> {
  const person = (personKey || "").toLowerCase().trim();
  if (!person) return;
  try {
    const sb = getSupabase();
    if (!sb) return;
    const date = todayIST();
    const { data: existing } = await sb
      .from("mh_attendance")
      .select("login_min")
      .eq("person_key", person).eq("date", date)
      .maybeSingle();
    if (existing && existing.login_min != null) return;   // already in for today

    await sb.from("mh_attendance").upsert(
      { person_key: person, date, login_min: loginMinIST(now), login_at: clockIST(now), updated_at: new Date().toISOString() },
      { onConflict: "person_key,date" },
    );
  } catch { /* attendance is a record, never a gate on signing in */ }
}
