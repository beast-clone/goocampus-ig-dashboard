// Lead assignment tracker — who got which leads, when, and whether that was sane.
//
// Reads the Sales Hub base (see lib/sales-hub.ts) and joins four tables:
//   CRM               → the leads themselves + their current counsellor & status
//   Counsellors       → name ↔ Airtable user id (needed to raise a transfer)
//   Attendance        → Present/Absent per counsellor per day
//   Lead Distribution → the allocation counts the round-robin declared that day
//
// The join that matters: a lead whose counsellor was marked **Absent** on the day
// it landed is a misassignment — the round-robin handed it to someone on leave and
// nobody is calling it. Those are surfaced as "conflicts" so they can be revoked.
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
  ATTENDANCE_TABLE,
  DISTRIBUTION_TABLE,
} from "./sales-hub";

// Statuses that mean the lead is finished — excluded from "active" tracking.
const CLOSED_STATUSES = new Set(["Converted", "Not Interested", "Junk", "Lost", "Dead", "Closed"]);

export function isClosedStatus(s: string): boolean {
  return CLOSED_STATUSES.has(s.trim());
}

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

export type RosterEntry = { name: string; userId: string; email: string; label: string };

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
    out.push({ name, userId: user.id, email: pickName(r.fields["Email"]) || user.email, label: pickName(r.fields["Label"]) || name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// "Absent" days per counsellor name → Set of YYYY-MM-DD.
export async function getAbsenceMap(from: string, to: string): Promise<Map<string, Set<string>>> {
  const rows = await getAttendanceRows(from, to);
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (pickName(r.fields["Attendance"]) !== "Absent") continue;
    const day = pickName(r.fields["Date"]).slice(0, 10);
    const who = pickUser(r.fields["Assigned User"])?.name || pickName(r.fields["Name"]);
    if (!day || !who) continue;
    let set = map.get(who);
    if (!set) { set = new Set(); map.set(who, set); }
    set.add(day);
  }
  return map;
}

async function getAttendanceRows(from: string, to: string) {
  return airtableList<Record<string, unknown>>(ATTENDANCE_TABLE, {
    filterByFormula: dateRangeFormula("Date", from, to),
    fields: ["Name", "Attendance", "Date", "Assigned User"],
    pageSize: 100,
    maxRecords: 5_000,
  });
}

// The newest Attendance row in the whole table, regardless of range.
//
// This exists because the leave-conflict check is only as good as the Attendance
// table, and that table stopped being filled in Oct 2025. Without this the board
// would report a confident "0 went to someone on leave" when the truth is "nobody
// recorded who was on leave". The UI shows a staleness warning instead.
export async function getAttendanceCoverage(from: string, to: string): Promise<{ latest: string | null; rowsInRange: number }> {
  const [latestRows, inRange] = await Promise.all([
    airtableList<Record<string, unknown>>(ATTENDANCE_TABLE, {
      fields: ["Date"],
      sort: [{ field: "Date", direction: "desc" }],
      pageSize: 1,
      maxRecords: 1,
    }),
    getAttendanceRows(from, to),
  ]);
  const latest = latestRows.length ? pickName(latestRows[0].fields["Date"]).slice(0, 10) : null;
  return { latest: latest || null, rowsInRange: inRange.length };
}

export type AssignedLead = {
  id: string;
  name: string;
  mobile: string;
  counsellor: string;
  counsellorUserId: string;
  status: string;
  source: string;
  interest: string;
  assignedOn: string;      // YYYY-MM-DD — see the Created-Date assumption above
  lastActivityAt: string;
  daysUntouched: number;
  callAttempts: number;
  link: string;
  onLeaveConflict: boolean; // counsellor was Absent the day this landed
};

export type CounsellorTally = {
  name: string;
  userId: string;
  assigned: number;
  untouched: number;
  conflicts: number;
  closed: number;
  byStatus: { status: string; count: number }[];
};

export type BucketPoint = { key: string; label: string; generated: number; assigned: number; unassigned: number };

export type AssignmentBoard = {
  range: { from: string; to: string };
  bucket: "day" | "week";
  totals: { generated: number; assigned: number; unassigned: number; conflicts: number; untouched: number };
  series: BucketPoint[];
  counsellors: CounsellorTally[];
  roster: RosterEntry[];
  leads: AssignedLead[];
  declared: { date: string; counsellor: string; dmLeads: number; totalLeads: number; notes: string }[];
  // Whether the leave-conflict figure can be trusted at all — see getAttendanceCoverage.
  attendance: { latest: string | null; rowsInRange: number; coversRange: boolean };
};

const CRM_FIELDS = [
  "Full Name", "Mobile Number", "Created Date", "Actual Last Modified", "Counsellor",
  "Lead Source (n8n)", "Lead Status", "Primary Interest (n8n)", "Days Untouched",
  "Call Attempts", "Link to Record",
];

// Monday-anchored ISO week key, so "this week" matches how the team talks about it.
function weekKey(day: string): { key: string; label: string } {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - dow);
  const key = d.toISOString().slice(0, 10);
  const end = new Date(d); end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  return { key, label: `${fmt(d)} – ${fmt(end)}` };
}

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export async function getAssignmentBoard(
  from: string,
  to: string,
  bucket: "day" | "week",
  opts: { activeOnly?: boolean } = {},
): Promise<AssignmentBoard> {
  const [leadRows, roster, absence, distRows, attendance] = await Promise.all([
    airtableList<Record<string, unknown>>(CRM_TABLE, {
      filterByFormula: dateRangeFormula("Created Date", from, to),
      fields: CRM_FIELDS,
      pageSize: 100,
      maxRecords: 20_000,
    }),
    getCounsellorRoster(),
    getAbsenceMap(from, to),
    airtableList<Record<string, unknown>>(DISTRIBUTION_TABLE, {
      filterByFormula: dateRangeFormula("Date", from, to),
      fields: ["Date", "Counsellor", "DM Leads Count", "Total Leads Count", "Notes"],
      pageSize: 100,
      maxRecords: 5_000,
    }),
    getAttendanceCoverage(from, to),
  ]);

  const leads: AssignedLead[] = [];
  const tallies = new Map<string, CounsellorTally>();
  const statusByCounsellor = new Map<string, Map<string, number>>();
  const buckets = new Map<string, BucketPoint>();
  let generated = 0, assigned = 0, unassigned = 0, conflicts = 0, untouched = 0;

  for (const rec of leadRows) {
    const f = rec.fields;
    const createdIso = pickName(f["Created Date"]);
    if (!createdIso) continue;
    const day = createdIso.slice(0, 10);
    const user = pickUser(f["Counsellor"]);
    const counsellor = user?.name || "";
    const status = pickName(f["Lead Status"]) || "—";
    const closed = isClosedStatus(status);
    if (opts.activeOnly && closed) continue;

    generated++;
    const bk = bucket === "week" ? weekKey(day) : { key: day, label: dayLabel(day) };
    let point = buckets.get(bk.key);
    if (!point) { point = { key: bk.key, label: bk.label, generated: 0, assigned: 0, unassigned: 0 }; buckets.set(bk.key, point); }
    point.generated++;

    if (!counsellor) {
      unassigned++;
      point.unassigned++;
      continue;
    }
    assigned++;
    point.assigned++;

    const daysUntouched = pickNumber(f["Days Untouched"]);
    const conflict = absence.get(counsellor)?.has(day) === true;
    if (conflict) conflicts++;
    if (daysUntouched > 7) untouched++;

    let t = tallies.get(counsellor);
    if (!t) {
      t = { name: counsellor, userId: user!.id, assigned: 0, untouched: 0, conflicts: 0, closed: 0, byStatus: [] };
      tallies.set(counsellor, t);
      statusByCounsellor.set(counsellor, new Map());
    }
    t.assigned++;
    if (conflict) t.conflicts++;
    if (daysUntouched > 7) t.untouched++;
    if (closed) t.closed++;
    const sm = statusByCounsellor.get(counsellor)!;
    sm.set(status, (sm.get(status) || 0) + 1);

    leads.push({
      id: rec.id,
      name: pickName(f["Full Name"]) || "(no name)",
      mobile: pickName(f["Mobile Number"]),
      counsellor,
      counsellorUserId: user!.id,
      status,
      source: pickName(f["Lead Source (n8n)"]) || "—",
      interest: pickName(f["Primary Interest (n8n)"]) || "—",
      assignedOn: day,
      lastActivityAt: pickName(f["Actual Last Modified"]),
      daysUntouched,
      callAttempts: pickNumber(f["Call Attempts"]),
      link: pickName(f["Link to Record"]),
      onLeaveConflict: conflict,
    });
  }

  for (const [name, sm] of statusByCounsellor) {
    const t = tallies.get(name);
    if (t) t.byStatus = [...sm.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }

  const declared = distRows.map((r) => ({
    date: pickName(r.fields["Date"]).slice(0, 10),
    counsellor: pickUser(r.fields["Counsellor"])?.name || pickName(r.fields["Counsellor"]),
    dmLeads: pickNumber(r.fields["DM Leads Count"]),
    totalLeads: pickNumber(r.fields["Total Leads Count"]),
    notes: pickName(r.fields["Notes"]),
  })).filter((d) => d.date);

  return {
    range: { from, to },
    bucket,
    totals: { generated, assigned, unassigned, conflicts, untouched },
    series: [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    // Conflicts first, then volume — the rows needing action sit at the top.
    counsellors: [...tallies.values()].sort((a, b) => b.conflicts - a.conflicts || b.assigned - a.assigned),
    roster,
    // Newest first, but anything assigned to someone on leave floats up.
    leads: leads.sort((a, b) =>
      Number(b.onLeaveConflict) - Number(a.onLeaveConflict) || (a.assignedOn < b.assignedOn ? 1 : -1)),
    declared,
    attendance: { ...attendance, coversRange: attendance.rowsInRange > 0 },
  };
}
