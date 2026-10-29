// Shared by the Attendance board and its PDF report (docs/ATTENDANCE_SPEC.md).
// Minutes are from 9 AM IST, as stored in mh_attendance. Dates are YYYY-MM-DD (IST days).

export type Person = { key: string; name: string; role: string };
/** One person's day: arrived / left in minutes after 9 AM. live = today, no End day yet. */
export type Rec = { in: number; out: number; live: boolean } | null;
export type View = "day" | "week" | "month" | "custom";
export type Row = { p: Person; color: string; x: Rec[]; tot: number; present: number };

// One colour per person, in roster order — avatar, graph line.
export const COLORS = ["#3A57E8", "#1AA053", "#F16A1B", "#2138B0", "#8A92A6", "#C03221", "#0E9F9F", "#7A5AF8"];

const LUNCH_START = 240, LUNCH_END = 300;   // 1–2 PM
/** Working now = no End day and active in the last 15 minutes. */
export const LIVE_WINDOW = 15;

const D = (s: string) => new Date(s + "T00:00:00Z");
const ds = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return ds(d); };
/** Mon = 0 … Sun = 6 */
export const dow = (s: string) => (D(s).getUTCDay() + 6) % 7;
export const weekStart = (s: string) => addDays(s, -dow(s));
export const monthStart = (s: string) => s.slice(0, 8) + "01";
export function monthDays(s: string): string[] {
  const n = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${s.slice(0, 8)}${String(i + 1).padStart(2, "0")}`);
}
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
export function daysOf(view: View, anchor: string, from: string, to: string): string[] {
  if (view === "custom") return daysBetween(from, to);
  if (view === "day") return [anchor];
  if (view === "week") return Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i));
  return monthDays(anchor);
}

/** Arrived → left, minus whatever part of the 1–2 PM lunch falls inside it. */
export function hrs(x: Rec): number {
  if (!x || x.out <= x.in) return 0;
  const lunch = Math.max(0, Math.min(x.out, LUNCH_END) - Math.max(x.in, LUNCH_START));
  return Math.max(0, x.out - x.in - lunch);
}
export const fmt = (m: number) => {
  if (!m) return "—";
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`;
};
export const clock = (m: number) => {
  const t = 540 + m, h = Math.floor(t / 60), mm = ((t % 60) + 60) % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h >= 12 && h < 24 ? "PM" : "AM"}`;
};
const fmtD = (s: string, o: Intl.DateTimeFormatOptions) => D(s).toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
export const longDate = (s: string) => fmtD(s, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const short = (s: string) => fmtD(s, { day: "numeric", month: "short" });
export const dayLabel = (s: string) => fmtD(s, { weekday: "short", day: "numeric", month: "short" });
export const weekdayShort = (s: string) => fmtD(s, { weekday: "short" });
export const monthLabel = (s: string) => fmtD(s, { month: "long", year: "numeric" });

/** Working days that have been recorded so far: Mon–Fri, from the recording start, up to today. */
export const workdays = (days: string[], start: string, today: string) => days.filter((d) => dow(d) < 5 && d >= start && d <= today);
