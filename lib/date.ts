// Shared, friendly date formatting for the whole dashboard — one place so every
// surface reads the same. Two registers:
//   fmtDate      → "Tuesday, 28 July 2026"      (prominent / standalone dates)
//   fmtDateShort → "Tue, 28 Jul 2026"           (dense table cells, chips)
//   fmtDateTime  → "Tuesday, 23 July 2026, 10:05 am"  (timestamps)
// Everything renders in India Standard Time, whoever is looking.
// Relative phrases ("Overdue · 2 days", "3h ago") are intentionally left to the
// caller — they read clearer than an absolute date in those spots.

// Parse a date-only ISO ("2026-07-28") as a LOCAL calendar date so it never
// slips a day from UTC-midnight; full timestamps parse normally.
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const s = String(iso).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.slice(0, 10));
  const d = s.length <= 10 && m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// The team works in India and the CRM records IST, so every date and time in this
// dashboard is India Standard Time — pinned, not inherited from whatever machine
// happens to be rendering. Without this, the same timestamp read differently on a
// laptop abroad and differently again when rendered on the server.
export const IST = "Asia/Kolkata";

const DATE_FULL: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
const DATE_SHORT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };

// A date-only value ("2026-07-28") is a calendar day, not an instant — converting
// it between zones would slide it to the 27th or 29th. Only real timestamps get
// the IST conversion.
const isDateOnly = (iso: string | null | undefined) => !!iso && String(iso).trim().length <= 10;
const zone = (iso: string | null | undefined): Intl.DateTimeFormatOptions =>
  isDateOnly(iso) ? {} : { timeZone: IST };

/** "Tuesday, 28 July 2026" — prominent / standalone dates. */
export function fmtDate(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-GB", { ...DATE_FULL, ...zone(iso) }) : fallback;
}

/** "Tue, 28 Jul 2026" — dense table cells and chips. */
export function fmtDateShort(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-GB", { ...DATE_SHORT, ...zone(iso) }) : fallback;
}

/** "Tuesday, 23 July 2026, 10:05 am" — timestamps (date + time). */
export function fmtDateTime(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso);
  if (!d) return fallback;
  return `${d.toLocaleDateString("en-GB", { ...DATE_FULL, ...zone(iso) })}, ${d.toLocaleTimeString("en-IN", { ...TIME, ...zone(iso) })}`;
}

/** "10:05 am" — time only. */
export function fmtTime(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso);
  return d ? d.toLocaleTimeString("en-IN", { ...TIME, ...zone(iso) }) : fallback;
}
