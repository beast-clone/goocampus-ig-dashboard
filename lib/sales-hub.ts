// Read-only client for the GooCampus Sales Hub Airtable base.
//
// Base: appersdbBcpxhadnD
// Tables used:
//   CRM (tblTvEGviLA4tEjic)                — 30k+ lead records
//   Contract Generator (tbl82JrETFxd3EMzK) — contract events
//   Revenue Tracker (tblILjlpqc9r3IgZT)    — booked payments
//
// NO WRITES. Only GET requests. If a caller ever adds a POST/PATCH here,
// stop the review and check with the user — the base has 30k rows with
// no backup.

import { recordApiCall } from "./api-usage";
import { fetchWithTimeout } from "./fetch-with-timeout";

export const SALES_HUB_BASE = "appersdbBcpxhadnD";
export const CRM_TABLE = "tblTvEGviLA4tEjic";
export const CONTRACT_TABLE = "tbl82JrETFxd3EMzK";
export const REVENUE_TABLE = "tblILjlpqc9r3IgZT";
export const PERFORMANCE_TABLE = "tblCbLe3OVrH7cgfq";        // counsellor call activity
export const SALES_SYSTEM_TABLE = "tbl7XIQr0T6FBrml1";       // meetings, ratings, AI summaries
export const ATTENDANCE_TABLE = "tblGjGNBWu4TeHZu9";         // daily attendance
export const DISTRIBUTION_TABLE = "tbl19dC2C3ROOgfLW";       // daily lead allocation
export const OFFICE_TABLE = "tblYQDbHZyW9Khbig";             // walk-in enquiries

function token(): string {
  const t = process.env.AIRTABLE_API_KEY;
  if (!t) throw new Error("AIRTABLE_API_KEY not configured");
  return t;
}

type AirtableListResponse<T = Record<string, unknown>> = {
  records: Array<{ id: string; fields: T; createdTime?: string }>;
  offset?: string;
};

export async function airtableList<T = Record<string, unknown>>(
  tableId: string,
  params: {
    filterByFormula?: string;
    fields?: string[];
    pageSize?: number;
    maxRecords?: number;
    sort?: Array<{ field: string; direction?: "asc" | "desc" }>;
  } = {},
): Promise<Array<{ id: string; fields: T }>> {
  const out: Array<{ id: string; fields: T }> = [];
  let offset: string | undefined;
  const cap = params.maxRecords ?? 50_000;

  do {
    const qs = new URLSearchParams();
    qs.set("pageSize", String(params.pageSize ?? 100));
    if (params.filterByFormula) qs.set("filterByFormula", params.filterByFormula);
    (params.fields || []).forEach((f) => qs.append("fields[]", f));
    (params.sort || []).forEach((s, i) => {
      qs.append(`sort[${i}][field]`, s.field);
      if (s.direction) qs.append(`sort[${i}][direction]`, s.direction);
    });
    if (offset) qs.set("offset", offset);

    const r = await fetchWithTimeout(`https://api.airtable.com/v0/${SALES_HUB_BASE}/${tableId}?${qs}`, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
    recordApiCall("Airtable", r.ok, r.status);
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Airtable ${r.status}: ${text.slice(0, 200)}`);
    }
    const json = (await r.json()) as AirtableListResponse<T>;
    for (const rec of json.records) {
      out.push({ id: rec.id, fields: rec.fields });
      if (out.length >= cap) return out;
    }
    offset = json.offset;
  } while (offset);

  return out;
}

// Airtable date filter — compares the Created Date field's YYYY-MM-DD string
// against the range. Safer than IS_AFTER/IS_BEFORE (which have timezone gotchas)
// and works with the createdTime field type.
export function dateRangeFormula(fieldName: string, from: string, to: string): string {
  // Reject anything that isn't a strict YYYY-MM-DD so from/to can't break out of
  // the quoted formula string (Airtable formula injection).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("dateRangeFormula: from/to must be YYYY-MM-DD");
  }
  const f = `{${fieldName}}`;
  return `AND(DATETIME_FORMAT(${f}, 'YYYY-MM-DD') >= '${from}', DATETIME_FORMAT(${f}, 'YYYY-MM-DD') <= '${to}')`;
}

// Extract a plain string label from Airtable's various field shapes.
export function pickName(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(pickName).filter(Boolean).join(", ");
  if (typeof v === "object" && v) {
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string") return o.name;
    if (typeof o.email === "string") return o.email;
  }
  return "";
}

export function pickNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}
