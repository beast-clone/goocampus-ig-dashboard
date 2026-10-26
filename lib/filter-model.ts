// The Airtable-style filter — the model and the matching, with no opinion about
// what is being filtered.
//
// This started life inside the Marketing Hub's master sheet. Sales Ops asked for
// "filters like in airtable" on two of its own pages (Maheen, 22 Sep), and copying
// 200 lines to get them is how two filter UIs end up disagreeing about what "is
// empty" means. So the engine lives here and each page brings its own fields.
//
// A page describes its rows with FilterFieldDef<T>: a label to show, a type that
// decides which operators are offered, and a `get` that pulls the value off one
// row. Nothing here knows about tasks, leads, or the team.

export type FieldType = "text" | "select" | "owner" | "date" | "checkbox";

export type FilterOp =
  | "is" | "isNot" | "isAnyOf" | "isNoneOf"
  | "contains" | "doesNotContain"
  | "isEmpty" | "isNotEmpty"
  | "isBefore" | "isAfter" | "isOnOrBefore" | "isOnOrAfter" | "isWithin"
  | "isChecked" | "isNotChecked";

// Dates are compared against a day worked out when the filter runs, the way
// Airtable does it: "today", "one week ago", "5 days from now", or an exact date.
export type DateMode =
  | "today" | "tomorrow" | "yesterday"
  | "oneWeekAgo" | "oneWeekFromNow" | "oneMonthAgo" | "oneMonthFromNow"
  | "daysAgo" | "daysFromNow" | "exact";
// "is within" takes a window instead of a day.
export type WithinMode =
  | "pastWeek" | "pastMonth" | "pastYear" | "nextWeek" | "nextMonth" | "nextYear"
  | "pastDays" | "nextDays" | "thisWeek" | "thisMonth" | "thisYear";

/** `mode`/`n` only matter for dates; a date condition without a mode is an exact date. */
export type FilterCondition = { field: string; op: FilterOp; value?: string | string[]; mode?: DateMode | WithinMode; n?: number };
/** Airtable's "condition group" — its own and/or, one level deep. */
export type FilterGroup = { conjunction: "and" | "or"; conditions: FilterCondition[] };
export type FilterItem = FilterCondition | FilterGroup;
export type FilterModel = { conjunction: "and" | "or"; conditions: FilterItem[] };
export const EMPTY_FILTER: FilterModel = { conjunction: "and", conditions: [] };
export const isGroup = (x: FilterItem): x is FilterGroup => Array.isArray((x as FilterGroup).conditions);
/** How many conditions, counting the ones inside groups — for "Filtered · 3". */
export const countConditions = (f: FilterModel) => f.conditions.reduce((n, c) => n + (isGroup(c) ? c.conditions.length : 1), 0);

export type FilterFieldDef<T> = {
  key: string;
  label: string;
  type: FieldType;
  get: (r: T) => string | boolean;
  options?: string[];
  custom?: boolean;
};

/** Which operators a field type offers, and whether each needs a value. */
export const OPS_BY_TYPE: Record<FieldType, { op: FilterOp; label: string; arity: "none" | "one" | "many" }[]> = {
  text: [{ op: "contains", label: "contains", arity: "one" }, { op: "doesNotContain", label: "does not contain", arity: "one" }, { op: "is", label: "is", arity: "one" }, { op: "isNot", label: "is not", arity: "one" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  select: [{ op: "is", label: "is", arity: "one" }, { op: "isNot", label: "is not", arity: "one" }, { op: "isAnyOf", label: "is any of", arity: "many" }, { op: "isNoneOf", label: "is none of", arity: "many" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  owner: [{ op: "is", label: "is", arity: "one" }, { op: "isNot", label: "is not", arity: "one" }, { op: "isAnyOf", label: "is any of", arity: "many" }, { op: "isNoneOf", label: "is none of", arity: "many" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  date: [{ op: "is", label: "is", arity: "one" }, { op: "isWithin", label: "is within", arity: "one" }, { op: "isBefore", label: "is before", arity: "one" }, { op: "isAfter", label: "is after", arity: "one" }, { op: "isOnOrBefore", label: "is on or before", arity: "one" }, { op: "isOnOrAfter", label: "is on or after", arity: "one" }, { op: "isNot", label: "is not", arity: "one" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  checkbox: [{ op: "isChecked", label: "is checked", arity: "none" }, { op: "isNotChecked", label: "is unchecked", arity: "none" }],
};

export const DATE_MODES: { value: DateMode; label: string }[] = [
  { value: "today", label: "today" }, { value: "tomorrow", label: "tomorrow" }, { value: "yesterday", label: "yesterday" },
  { value: "oneWeekAgo", label: "one week ago" }, { value: "oneWeekFromNow", label: "one week from now" },
  { value: "oneMonthAgo", label: "one month ago" }, { value: "oneMonthFromNow", label: "one month from now" },
  { value: "daysAgo", label: "number of days ago" }, { value: "daysFromNow", label: "number of days from now" },
  { value: "exact", label: "exact date" },
];
export const WITHIN_MODES: { value: WithinMode; label: string }[] = [
  { value: "pastWeek", label: "the past week" }, { value: "pastMonth", label: "the past month" }, { value: "pastYear", label: "the past year" },
  { value: "nextWeek", label: "the next week" }, { value: "nextMonth", label: "the next month" }, { value: "nextYear", label: "the next year" },
  { value: "pastDays", label: "the past number of days" }, { value: "nextDays", label: "the next number of days" },
  { value: "thisWeek", label: "this calendar week" }, { value: "thisMonth", label: "this calendar month" }, { value: "thisYear", label: "this calendar year" },
];
const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const shiftMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
/** The day a date condition compares with ("" = not set yet, so it doesn't filter). */
function dayFor(c: FilterCondition, now = new Date()): string {
  const n = Math.max(0, Number(c.n) || 0);
  switch ((c.mode as DateMode) || "exact") {
    case "today": return ymdOf(now);
    case "tomorrow": return ymdOf(shiftDays(now, 1));
    case "yesterday": return ymdOf(shiftDays(now, -1));
    case "oneWeekAgo": return ymdOf(shiftDays(now, -7));
    case "oneWeekFromNow": return ymdOf(shiftDays(now, 7));
    case "oneMonthAgo": return ymdOf(shiftMonths(now, -1));
    case "oneMonthFromNow": return ymdOf(shiftMonths(now, 1));
    case "daysAgo": return ymdOf(shiftDays(now, -n));
    case "daysFromNow": return ymdOf(shiftDays(now, n));
    default: return String(c.value || "").slice(0, 10);
  }
}
/** The [from, to] window for "is within" (both inclusive). */
function windowFor(c: FilterCondition, now = new Date()): [string, string] | null {
  const n = Math.max(0, Number(c.n) || 0);
  const t = ymdOf(now);
  switch (c.mode as WithinMode) {
    case "pastWeek": return [ymdOf(shiftDays(now, -7)), t];
    case "pastMonth": return [ymdOf(shiftMonths(now, -1)), t];
    case "pastYear": return [ymdOf(shiftMonths(now, -12)), t];
    case "nextWeek": return [t, ymdOf(shiftDays(now, 7))];
    case "nextMonth": return [t, ymdOf(shiftMonths(now, 1))];
    case "nextYear": return [t, ymdOf(shiftMonths(now, 12))];
    case "pastDays": return [ymdOf(shiftDays(now, -n)), t];
    case "nextDays": return [t, ymdOf(shiftDays(now, n))];
    case "thisWeek": { const mon = shiftDays(now, -((now.getDay() + 6) % 7)); return [ymdOf(mon), ymdOf(shiftDays(mon, 6))]; }
    case "thisMonth": return [ymdOf(new Date(now.getFullYear(), now.getMonth(), 1)), ymdOf(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
    case "thisYear": return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
    default: return null;
  }
}

/**
 * How an "owner" field decides two values are the same person.
 *
 * A stored owner is a display name ("Manya B M") while the filter holds a key
 * ("manya"), and each page knows its own people. Pages without owner fields can
 * leave this out — then owner compares as plain text.
 */
export type OwnerEq = (storedValue: string, key: string) => boolean;

function evalCondition<T>(r: T, c: FilterCondition, fields: FilterFieldDef<T>[], ownerEq?: OwnerEq): boolean {
  const def = fields.find((f) => f.key === c.field);
  if (!def) return true;               // a condition on a field this page dropped
  const raw = def.get(r);
  const s = typeof raw === "boolean" ? "" : raw;
  const one = String(c.value ?? "");
  const many = Array.isArray(c.value) ? c.value : [];
  const eq = (v: string) => (def.type === "owner" && ownerEq ? ownerEq(s, v) : s === v);
  // Like Airtable, a condition still waiting for its value doesn't filter anything —
  // picking "Status is" shouldn't empty the sheet before a status is chosen.
  if (["is", "isNot", "contains", "doesNotContain"].includes(c.op) && def.type !== "date" && !one) return true;
  if (["isAnyOf", "isNoneOf"].includes(c.op) && !many.length) return true;
  if (def.type === "date" && !["isEmpty", "isNotEmpty"].includes(c.op)) {
    const d = s.slice(0, 10);
    if (c.op === "isWithin") { const w = windowFor(c); return !w || (!!d && d >= w[0] && d <= w[1]); }
    const t = dayFor(c);
    if (!t) return true;                 // no date picked yet — don't hide everything
    switch (c.op) {
      case "is": return d === t;
      case "isNot": return d !== t;
      case "isBefore": return !!d && d < t;
      case "isAfter": return !!d && d > t;
      case "isOnOrBefore": return !!d && d <= t;
      case "isOnOrAfter": return !!d && d >= t;
      default: return true;
    }
  }
  switch (c.op) {
    case "isEmpty": return typeof raw === "boolean" ? !raw : !s;
    case "isNotEmpty": return typeof raw === "boolean" ? !!raw : !!s;
    case "isChecked": return raw === true;
    case "isNotChecked": return raw !== true;
    case "contains": return s.toLowerCase().includes(one.toLowerCase());
    case "doesNotContain": return !s.toLowerCase().includes(one.toLowerCase());
    case "isBefore": return !!s && s < one;
    case "isAfter": return !!s && s > one;
    case "is": return eq(one);
    case "isNot": return !eq(one);
    case "isAnyOf": return many.some(eq);
    case "isNoneOf": return !many.some(eq);
    default: return true;
  }
}

/** No conditions means no filtering — every row passes. An empty group passes too. */
export function evalFilter<T>(r: T, f: FilterModel | FilterGroup, fields: FilterFieldDef<T>[], ownerEq?: OwnerEq): boolean {
  const items = (f.conditions as FilterItem[]).filter((c) => !isGroup(c) || c.conditions.length);
  if (!items.length) return true;
  const res = items.map((c) => (isGroup(c) ? evalFilter(r, c, fields, ownerEq) : evalCondition(r, c, fields, ownerEq)));
  return f.conjunction === "or" ? res.some(Boolean) : res.every(Boolean);
}

/** One readable line per condition — for chips and saved-view summaries. */
export function summarizeFilter<T>(
  f: FilterModel,
  fields: FilterFieldDef<T>[],
  ownerLabel?: (key: string) => string,
): string[] {
  const one = (c: FilterCondition) => {
    const def = fields.find((d) => d.key === c.field);
    const label = def?.label || c.field;
    const opLabel = OPS_BY_TYPE[def?.type || "text"].find((o) => o.op === c.op)?.label || c.op;
    const name = (v: string) => (def?.type === "owner" && ownerLabel ? ownerLabel(v) : v);
    let val = Array.isArray(c.value) ? c.value.map(name).join(", ") : name(String(c.value ?? ""));
    if (def?.type === "date" && c.mode && c.mode !== "exact") {
      const m = [...DATE_MODES, ...WITHIN_MODES].find((x) => x.value === c.mode)?.label || c.mode;
      val = /number of days/.test(m) ? m.replace("number of", String(c.n ?? 0)) : m;
    }
    return `${label} ${opLabel}${val ? ` ${val}` : ""}`.trim();
  };
  return f.conditions.map((c) => (isGroup(c) ? `(${c.conditions.map(one).join(` ${c.conjunction} `)})` : one(c)));
}
