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
  | "isBefore" | "isAfter"
  | "isChecked" | "isNotChecked";

export type FilterCondition = { field: string; op: FilterOp; value?: string | string[] };
export type FilterModel = { conjunction: "and" | "or"; conditions: FilterCondition[] };
export const EMPTY_FILTER: FilterModel = { conjunction: "and", conditions: [] };

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
  text: [{ op: "contains", label: "contains", arity: "one" }, { op: "doesNotContain", label: "does not contain", arity: "one" }, { op: "is", label: "is", arity: "one" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  select: [{ op: "is", label: "is", arity: "one" }, { op: "isNot", label: "is not", arity: "one" }, { op: "isAnyOf", label: "is any of", arity: "many" }, { op: "isNoneOf", label: "is none of", arity: "many" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  owner: [{ op: "is", label: "is", arity: "one" }, { op: "isAnyOf", label: "is any of", arity: "many" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  date: [{ op: "is", label: "is", arity: "one" }, { op: "isBefore", label: "is before", arity: "one" }, { op: "isAfter", label: "is after", arity: "one" }, { op: "isEmpty", label: "is empty", arity: "none" }, { op: "isNotEmpty", label: "is not empty", arity: "none" }],
  checkbox: [{ op: "isChecked", label: "is checked", arity: "none" }, { op: "isNotChecked", label: "is unchecked", arity: "none" }],
};

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

/** No conditions means no filtering — every row passes. */
export function evalFilter<T>(r: T, f: FilterModel, fields: FilterFieldDef<T>[], ownerEq?: OwnerEq): boolean {
  if (!f.conditions.length) return true;
  const res = f.conditions.map((c) => evalCondition(r, c, fields, ownerEq));
  return f.conjunction === "or" ? res.some(Boolean) : res.every(Boolean);
}

/** One readable line per condition — for chips and saved-view summaries. */
export function summarizeFilter<T>(
  f: FilterModel,
  fields: FilterFieldDef<T>[],
  ownerLabel?: (key: string) => string,
): string[] {
  return f.conditions.map((c) => {
    const def = fields.find((d) => d.key === c.field);
    const label = def?.label || c.field;
    const opLabel = OPS_BY_TYPE[def?.type || "text"].find((o) => o.op === c.op)?.label || c.op;
    const name = (v: string) => (def?.type === "owner" && ownerLabel ? ownerLabel(v) : v);
    const val = Array.isArray(c.value)
      ? c.value.map(name).join(", ")
      : name(String(c.value ?? ""));
    return `${label} ${opLabel}${val ? ` ${val}` : ""}`.trim();
  });
}
