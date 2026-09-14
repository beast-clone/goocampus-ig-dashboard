// Client for the GooCampus Sales Hub Airtable base.
//
// Base: appersdbBcpxhadnD
// Tables used:
//   CRM (tblTvEGviLA4tEjic)                — 30k+ lead records
//   Contract Generator (tbl82JrETFxd3EMzK) — contract events
//   Revenue Tracker (tblILjlpqc9r3IgZT)    — booked payments
//
// READ-ONLY, WITH ONE DELIBERATE EXCEPTION.
//
// Everything here is GET except `createTransferRequest()`, which appends a row
// to the Transfer Ownership table and nothing else. That exception was approved
// explicitly (2026-08-19) for the Sales Hub reassignment UI. It is safe because
// it only ever writes to the Transfer Ownership REQUEST table — never the CRM
// lead itself: it CREATES a Pending request row. Confirm Transfer defaults to
// unticked (parked for review); the caller may set `confirm: true` to tick it
// from the dashboard (user request 2026-09-14) instead of opening Airtable.
// Either way the actual CRM owner change is done by the base's own automation
// ("Transfer Ownership on CRM", every 20 min) — this file never moves a lead.
//
// The old rule still stands for everything else: no PATCH or DELETE, and no
// writes at all to CRM / Revenue / Contract. The base holds 30k rows with no
// backup. If a caller needs to mutate a lead, stop and check with the user.

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
export const DM_LEADS_TABLE = "tbl8CpgnQSYcbFKEH";          // Instagram DM leads (~1.6k)
export const PRIMARY_INTERESTS_TABLE = "tblvRRClI9ICwMwzV"; // DB: Primary Interests (id → name)
export const TRANSFER_TABLE = "tblNbJfDXKE4iNrrM";           // Transfer Ownership (reassignment requests)
export const COUNSELLORS_TABLE = "tblhSMVy2sDbEOPqp";        // Counsellors roster (name ↔ Airtable user)
export const OPEN_CLAIMED_TABLE = "tblZ1eoeV0HbL5VXh";       // Open & Claimed Leads (claim trail)

// A SEPARATE base — the round-robin assignment log that feeds the 11:59 PM IST
// Telegram daily summary. "Assigned Time" here is the real moment a lead was
// handed to a counsellor (the CRM has no such timestamp), so per-day-per-counsellor
// counts read from here match the Telegram to the lead. Read-only, like everything.
export const LEAD_DISTRIBUTION_BASE = "appeQ7NIq57AQA6Hc";
export const DISTRIBUTION_MASTERSHEET = "tblz8iHKuE0fvuDOO"; // Lead Distribution → Mastersheet

// Transfer Ownership field ids. Written by id, not name, so a rename in Airtable
// can't silently start dropping the payload on the floor.
export const TRANSFER_FIELDS = {
  lead: "fldCdNo14YyA1TLZ2",          // "Full name"  → link to the CRM record
  originalCounsellor: "fld7XBFKp3szcCcGe", // singleCollaborator
  newOwner: "fldeIvIzBJ4HJnyN9",      // singleCollaborator
  notes: "fldMqzw5LDIlq7JqK",         // "Transfer Notes"
  confirm: "fldxOpQaDfZbb1Yps",       // "Confirm Transfer" checkbox
  status: "fldeM2sPSOkdMG64J",        // "Pending" | "Transfer Completed"
} as const;

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
    baseId?: string; // defaults to SALES_HUB_BASE; set to read another base (e.g. the Lead Distribution log)
  } = {},
): Promise<Array<{ id: string; fields: T }>> {
  const out: Array<{ id: string; fields: T }> = [];
  let offset: string | undefined;
  // A caller that asks for maxRecords wants a sample and truncating is the point.
  // The 50k default is a runaway guard, not a limit anyone chose — hitting it means
  // the table outgrew it and every total built from this read is quietly short. The
  // CRM is already ~35k rows, so say so loudly instead of returning wrong numbers:
  // this dashboard's whole job is to be exact about what Airtable holds.
  const explicitCap = typeof params.maxRecords === "number";
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

    const r = await fetchWithTimeout(`https://api.airtable.com/v0/${params.baseId ?? SALES_HUB_BASE}/${tableId}?${qs}`, {
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
      if (out.length >= cap) {
        if (explicitCap) return out;
        throw new Error(
          `Airtable table ${tableId} has more than ${cap.toLocaleString()} matching records — ` +
          `this read would be incomplete. Raise the cap in airtableList() or narrow the filter.`,
        );
      }
    }
    offset = json.offset;
  } while (offset);

  return out;
}

// Fetch ONE record by id (read-only). Used by the lead-detail view.
export async function airtableGetRecord<T = Record<string, unknown>>(
  tableId: string,
  recordId: string,
  baseId: string = SALES_HUB_BASE,
): Promise<{ id: string; fields: T } | null> {
  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) throw new Error("recordId must be an Airtable record id");
  const r = await fetchWithTimeout(`https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });
  recordApiCall("Airtable", r.ok, r.status);
  if (r.status === 404) return null;
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Airtable ${r.status}: ${text.slice(0, 200)}`);
  }
  return (await r.json()) as { id: string; fields: T };
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
  // Airtable stores these as UTC instants. Formatting without a timezone compared
  // UTC days, so a lead created at, say, 01:00 IST — 19:30 UTC the day before —
  // landed in the wrong day and could fall outside the range entirely at its edges.
  // SET_TIMEZONE makes the comparison happen on IST calendar days, which is what
  // "leads on 20 August" means to the team.
  const f = `SET_TIMEZONE({${fieldName}}, 'Asia/Kolkata')`;
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

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE WRITE. See the header note before adding anything alongside it.
// ─────────────────────────────────────────────────────────────────────────────

export type TransferRequestInput = {
  leadRecordId: string;      // rec… in CRM
  fromUserId?: string;       // usr… current counsellor (blank when unassigned)
  toUserId: string;          // usr… the counsellor picking it up
  notes: string;             // why — shown in Airtable and in the request list
  confirm?: boolean;         // tick "Confirm Transfer" now → the 20-min automation
                             // moves the lead without a manual tick in Airtable.
                             // Default false = parked for review. Still only writes
                             // this request row — the CRM move is the automation's.
};

export type TransferRequestResult = { id: string; requestId?: number };

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
const USR_ID = /^usr[A-Za-z0-9]{14}$/;

// Append ONE "Pending" row to Transfer Ownership. Deliberately cannot express
// anything else: no table parameter, no PATCH path, and Confirm Transfer is
// hard-coded false so this can never complete a transfer on its own. A human
// ticks the box in Airtable; the base's existing automation does the actual move.
export async function createTransferRequest(input: TransferRequestInput): Promise<TransferRequestResult> {
  if (!REC_ID.test(input.leadRecordId)) throw new Error("leadRecordId must be an Airtable record id");
  if (!USR_ID.test(input.toUserId)) throw new Error("toUserId must be an Airtable user id");
  if (input.fromUserId && !USR_ID.test(input.fromUserId)) throw new Error("fromUserId must be an Airtable user id");

  const fields: Record<string, unknown> = {
    [TRANSFER_FIELDS.lead]: [input.leadRecordId],
    [TRANSFER_FIELDS.newOwner]: { id: input.toUserId },
    [TRANSFER_FIELDS.notes]: input.notes.slice(0, 500),
    // Confirm from the dashboard when the caller ticks it (default false = parked
    // for a manual review tick in Airtable). Even confirmed, this only marks the
    // request row — the "Transfer Ownership on CRM" automation does the actual move.
    [TRANSFER_FIELDS.confirm]: !!input.confirm,
    [TRANSFER_FIELDS.status]: "Pending",
  };
  if (input.fromUserId) fields[TRANSFER_FIELDS.originalCounsellor] = { id: input.fromUserId };

  const r = await fetchWithTimeout(`https://api.airtable.com/v0/${SALES_HUB_BASE}/${TRANSFER_TABLE}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
    cache: "no-store",
  });
  recordApiCall("Airtable", r.ok, r.status);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Airtable ${r.status}: ${text.slice(0, 300)}`);
  }
  const json = (await r.json()) as { id: string; fields?: Record<string, unknown> };
  const reqNo = json.fields?.["Request ID"];
  return { id: json.id, requestId: typeof reqNo === "number" ? reqNo : undefined };
}

// Refresh window for the read-only Sales Hub snapshots.
//
// The team works ~09:00–21:00 IST and only checks the dashboard during (and a bit
// around) those hours, so there is no reason to re-hit Airtable overnight. We
// refresh from 06:00 IST (so the data is current before the first person arrives)
// through midnight, and go quiet 00:00–06:00 IST. This is purely a read gate —
// the dashboard always serves the last stored snapshot, so a late-night viewer
// still sees data; we just don't spend an Airtable read to refresh it.
export function inActiveRefreshWindow(now: Date = new Date()): boolean {
  const istMinutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440; // UTC+5:30
  const istHour = Math.floor(istMinutes / 60);
  return istHour >= 6; // 06:00–23:59 IST → refresh · 00:00–05:59 IST → paused
}

// Days since anyone last edited a lead.
//
// DO NOT read the CRM's "Days Untouched" formula directly. It returns
// {specialValue:"NaN"} on more than half the table — 433 of 813 rows in an
// Aug-2026 sample — and pickNumber() turns that into 0. Every `idle > N` test
// therefore answered false for those rows, so the untouched/cold counts silently
// under-reported by roughly half, and the leads that most needed chasing were the
// ones missing from the list.
//
// "Actual Last Modified" is a real lastModifiedTime field, so it's the source of
// truth here; the formula is used only when it's genuinely numeric.
export function idleDays(fields: Record<string, unknown>): number {
  const iso = fields["Actual Last Modified"] ?? fields["Last Modified"];
  if (typeof iso === "string" && iso) {
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t)) return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  }
  const v = fields["Days Untouched"];
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
}
