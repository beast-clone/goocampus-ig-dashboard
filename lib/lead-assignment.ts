// Leads per day — the Sales Hub's lead board.
//
// One question per level, which is why this returns one cross-tab rather than a
// pile of separate aggregates:
//
//   1. how many leads arrived each day, and who got them   → `rows`
//   2. which leads arrived on a given day                  → `leads`, filtered client-side
//   3. what happened to one of them                        → /api/leads-crm/lead-track
//
// ASSUMPTION worth knowing: the CRM has no explicit "assigned on" timestamp — the
// round-robin assigns at creation — so **Created Date is treated as the assignment
// date**. If assignment ever decouples from creation, this needs a real field.

import {
  airtableList,
  dateRangeFormula,
  pickName,
  pickNumber,
  CRM_TABLE,
  COUNSELLORS_TABLE,
  idleDays,
} from "./sales-hub";

// Statuses that mean the lead is finished. Used by the nightly snapshot to decide
// what's still worth tracking.
const CLOSED_STATUSES = new Set(["Converted", "Not Interested", "Junk", "Lost", "Dead", "Closed"]);

export function isClosedStatus(s: string): boolean {
  return CLOSED_STATUSES.has(s.trim());
}

// No CRM activity in this many days = the lead has gone cold.
const COLD_AFTER_DAYS = 7;

// The people who actually work leads. Everything else in the CRM's Counsellor
// field is either the holding pool (Maheen — where leads park before they're
// distributed) or someone who happens to hold a stray record; showing either as a
// counsellor made the board read as if six people were selling.
//
// Leads not held by one of these are excluded from this board entirely. The true
// "leads generated" figure is unaffected — it's the KPI tile above this section.
// Edit this list when the sales team changes.
export const ACTIVE_COUNSELLORS = ["Robin Johnson J", "Jeswin Shaju"];

// Airtable collaborator cells arrive as { id, name, email }. pickName() gives the
// label; transfers need the user id too.
export function pickUser(v: unknown): { id: string; name: string; email: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = Array.isArray(v) ? (v[0] as Record<string, unknown>) : (v as Record<string, unknown>);
  if (!o || typeof o.id !== "string") return null;
  return {
    id: o.id,
    name: typeof o.name === "string" ? o.name : "",
    email: typeof o.email === "string" ? o.email : "",
  };
}

// `inRoster: false` = holds leads but isn't in the Counsellors table. They still
// need to be a valid transfer target, otherwise a lead sitting with someone
// off-roster can never be moved from here.
export type RosterEntry = { name: string; userId: string; email: string; label: string; inRoster: boolean };

export async function getCounsellorRoster(): Promise<RosterEntry[]> {
  const rows = await airtableList<Record<string, unknown>>(COUNSELLORS_TABLE, {
    fields: ["Name", "User", "Email", "Label"],
    pageSize: 100,
    maxRecords: 200,
  });
  const out: RosterEntry[] = [];
  for (const r of rows) {
    const user = pickUser(r.fields["User"]);
    const name = pickName(r.fields["Name"]) || user?.name || "";
    if (!user || !name) continue; // no Airtable user = can't be a transfer target
    out.push({
      name,
      userId: user.id,
      email: pickName(r.fields["Email"]) || user.email,
      label: pickName(r.fields["Label"]) || name,
      inRoster: true,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type BoardLead = {
  id: string;
  name: string;
  source: string;
  interest: string;
  counsellor: string;
  counsellorUserId: string;
  status: string;
  day: string;              // the bucket key it belongs to
  date: string;             // the actual IST day it arrived
  daysUntouched: number;
  cold: boolean;
  link: string;
};

export type BoardRow = {
  key: string;              // YYYY-MM-DD (bucket start)
  label: string;            // "19 Aug" / "04 – 10 Aug" / "August 2026"
  dow: string;              // "Wed" — empty for week/month
  total: number;
  by: Record<string, number>;
  cold: number;
};

export type LeadBoard = {
  range: { from: string; to: string };
  bucket: Bucket;
  counsellors: string[];    // column order, busiest first
  rows: BoardRow[];         // newest bucket first
  totals: { total: number; by: Record<string, number>; cold: number };
  roster: RosterEntry[];
  leads: BoardLead[];
};

export type Bucket = "day" | "week" | "month";

const CRM_FIELDS = [
  "Full Name", "Created Date", "Counsellor", "Lead Status",
  "Lead Source (n8n)", "Primary Interest (n8n)", "Days Untouched", "Actual Last Modified", "Link to Record",
];

// Leads with no counsellor still have to appear somewhere, or the row totals stop
// adding up and the table quietly lies.
const UNASSIGNED = "Unassigned";

// Airtable returns Created Date as a UTC instant. Slicing the ISO string would
// bucket a lead created 00:30 IST into the PREVIOUS day, because IST is UTC+5:30 —
// so a night-time lead silently lands in yesterday's column. The team works in IST,
// so every bucket is computed in IST.
const IST = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
});

function istDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return IST.format(d);
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function shortDate(day: string): string {
  const [, m, d] = day.split("-");
  return `${d} ${MON[Number(m) - 1].slice(0, 3)}`;
}

// Bucket a day into its group key + display label. Weeks are Monday-anchored, which
// is how the team talks about "this week".
function bucketOf(day: string, bucket: Bucket): { key: string; label: string; dow: string } {
  if (bucket === "month") {
    const [y, m] = day.split("-");
    return { key: `${y}-${m}-01`, label: `${MON[Number(m) - 1]} ${y}`, dow: "" };
  }
  if (bucket === "week") {
    const d = new Date(`${day}T00:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7; // Mon = 0
    d.setUTCDate(d.getUTCDate() - offset);
    const start = d.toISOString().slice(0, 10);
    const end = new Date(d);
    end.setUTCDate(end.getUTCDate() + 6);
    return { key: start, label: `${shortDate(start)} – ${shortDate(end.toISOString().slice(0, 10))}`, dow: "" };
  }
  const d = new Date(`${day}T00:00:00Z`);
  return { key: day, label: shortDate(day), dow: DOW[d.getUTCDay()] };
}

export async function getLeadBoard(from: string, to: string, bucket: Bucket): Promise<LeadBoard> {
  const [leadRows, roster] = await Promise.all([
    airtableList<Record<string, unknown>>(CRM_TABLE, {
      filterByFormula: dateRangeFormula("Created Date", from, to),
      fields: CRM_FIELDS,
      pageSize: 100,
      maxRecords: 20_000,
    }),
    getCounsellorRoster(),
  ]);

  const leads: BoardLead[] = [];
  const rowMap = new Map<string, BoardRow>();
  const volume = new Map<string, number>();
  const totalsBy: Record<string, number> = {};
  let total = 0;
  let coldTotal = 0;

  for (const rec of leadRows) {
    const f = rec.fields;
    const createdIso = pickName(f["Created Date"]);
    if (!createdIso) continue;

    const user = pickUser(f["Counsellor"]);
    const counsellor = user?.name || UNASSIGNED;
    // Pool + stray holders never reach the board — see ACTIVE_COUNSELLORS.
    if (!ACTIVE_COUNSELLORS.includes(counsellor)) continue;

    const date = istDay(createdIso);
    const b = bucketOf(date, bucket);
    const daysUntouched = idleDays(f);
    const cold = daysUntouched > COLD_AFTER_DAYS;

    let row = rowMap.get(b.key);
    if (!row) { row = { key: b.key, label: b.label, dow: b.dow, total: 0, by: {}, cold: 0 }; rowMap.set(b.key, row); }
    row.total++;
    row.by[counsellor] = (row.by[counsellor] || 0) + 1;
    if (cold) row.cold++;

    total++;
    totalsBy[counsellor] = (totalsBy[counsellor] || 0) + 1;
    if (cold) coldTotal++;
    volume.set(counsellor, (volume.get(counsellor) || 0) + 1);

    leads.push({
      id: rec.id,
      name: pickName(f["Full Name"]) || "(no name)",
      source: pickName(f["Lead Source (n8n)"]) || "—",
      interest: pickName(f["Primary Interest (n8n)"]) || "—",
      counsellor: user?.name || "",
      counsellorUserId: user?.id || "",
      status: pickName(f["Lead Status"]) || "—",
      day: b.key,
      date,
      daysUntouched,
      cold,
      link: pickName(f["Link to Record"]),
    });
  }

  // Fixed order, not by volume — the same two people in the same two places every
  // time, so the eye doesn't have to re-find a column when the range changes.
  // Anyone with no leads in range is dropped rather than shown as a column of dashes.
  const counsellors = ACTIVE_COUNSELLORS.filter((c) => (volume.get(c) || 0) > 0);

  // Anyone actually holding leads is a legitimate transfer target even if the
  // Counsellors table doesn't list them (it currently misses several people who
  // hold live leads). Roster entries stay first so the real list leads.
  const known = new Set(roster.map((r) => r.userId));
  const fullRoster: RosterEntry[] = [...roster];
  for (const l of leads) {
    if (l.counsellorUserId && !known.has(l.counsellorUserId)) {
      known.add(l.counsellorUserId);
      fullRoster.push({ name: l.counsellor, userId: l.counsellorUserId, email: "", label: l.counsellor, inRoster: false });
    }
  }

  return {
    range: { from, to },
    bucket,
    counsellors,
    rows: [...rowMap.values()].sort((a, b) => (a.key < b.key ? 1 : -1)), // newest first
    totals: { total, by: totalsBy, cold: coldTotal },
    roster: fullRoster,
    leads,
  };
}
