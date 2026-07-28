// Shared, friendly date formatting for the whole dashboard — one place so every
// surface reads the same. Two registers:
//   fmtDate      → "Tuesday, 28 July 2026"      (prominent / standalone dates)
//   fmtDateShort → "Tue, 28 Jul 2026"           (dense table cells, chips)
//   fmtDateTime  → "Tuesday, 23 July 2026, 10:05 am"  (timestamps)
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

const DATE_FULL: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric" };
const DATE_SHORT: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };

/** "Tuesday, 28 July 2026" — prominent / standalone dates. */
export function fmtDate(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-GB", DATE_FULL) : fallback;
}

/** "Tue, 28 Jul 2026" — dense table cells and chips. */
export function fmtDateShort(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString("en-GB", DATE_SHORT) : fallback;
}

/** "Tuesday, 23 July 2026, 10:05 am" — timestamps (date + time). */
export function fmtDateTime(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso);
  if (!d) return fallback;
  return `${d.toLocaleDateString("en-GB", DATE_FULL)}, ${d.toLocaleTimeString("en-IN", TIME)}`;
}

/** "10:05 am" — time only. */
export function fmtTime(iso: string | null | undefined, fallback = "—"): string {
  const d = parse(iso);
  return d ? d.toLocaleTimeString("en-IN", TIME) : fallback;
}
