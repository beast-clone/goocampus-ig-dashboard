// Nightly lead snapshot — the memory the tracker reads.
//
// Airtable overwrites Lead Status in place, so yesterday's stage is gone the
// moment a counsellor changes it. Once a day we copy the current state of every
// ACTIVE lead into Supabase; the tracker then diffs consecutive rows to show what
// actually happened to a lead and when.
//
// Scope (chosen deliberately): leads created in the last 90 days, PLUS any older
// lead that is still open. Snapshotting all 30k rows every night would be a much
// heavier job and far more Airtable calls for history nobody reads.

import { airtableList, pickName, pickNumber, idleDays, CRM_TABLE } from "./sales-hub";
import { isClosedStatus, pickUser, CLOSED_STATUSES } from "./lead-assignment";
import { getSupabase } from "./supabase";

const ACTIVE_WINDOW_DAYS = 90;

const FIELDS = [
  "Full Name", "Created Date", "Counsellor", "Lead Status",
  "Lead Source (n8n)", "Primary Interest (n8n)", "Days Untouched", "Actual Last Modified", "Call Attempts",
];

export type SnapshotResult = { scanned: number; stored: number; skippedClosed: number; truncated?: boolean };

export async function snapshotActiveLeads(day: string): Promise<SnapshotResult> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase not configured");

  const cutoff = new Date(`${day}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - ACTIVE_WINDOW_DAYS);
  const cutoffDay = cutoff.toISOString().slice(0, 10);

  // Recent-by-date OR still open, both pushed into the formula so Airtable does the
  // filtering. The previous version used `{Lead Status} != ''`, which is true for
  // almost every row — the OR made the filter a no-op and pulled the entire 35k-row
  // CRM every night, then silently truncated at the record cap.
  const closedList = [...CLOSED_STATUSES]
    .map((st) => `{Lead Status} = '${st.replace(/'/g, "\\'")}'`)
    .join(", ");
  const formula = `OR(DATETIME_FORMAT({Created Date}, 'YYYY-MM-DD') >= '${cutoffDay}', NOT(OR(${closedList})))`;

  const CAP = 40_000;
  const rows = await airtableList<Record<string, unknown>>(CRM_TABLE, {
    filterByFormula: formula,
    fields: FIELDS,
    pageSize: 100,
    maxRecords: CAP,
  });
  // Never truncate in silence — if the cap is ever reached the snapshot is
  // incomplete and whoever reads the history needs to know.
  const truncated = rows.length >= CAP;

  let skippedClosed = 0;
  const payload: Record<string, unknown>[] = [];
  for (const rec of rows) {
    const f = rec.fields;
    const created = pickName(f["Created Date"]).slice(0, 10);
    const status = pickName(f["Lead Status"]) || "";
    const recent = created >= cutoffDay;
    // Older AND finished → nothing left to track.
    if (!recent && isClosedStatus(status)) { skippedClosed++; continue; }

    payload.push({
      snapshot_date: day,
      lead_id: rec.id,
      lead_name: pickName(f["Full Name"]) || null,
      counsellor: pickUser(f["Counsellor"])?.name || null,
      status: status || null,
      source: pickName(f["Lead Source (n8n)"]) || null,
      interest: pickName(f["Primary Interest (n8n)"]) || null,
      days_untouched: idleDays(f),
      call_attempts: pickNumber(f["Call Attempts"]),
    });
  }

  // Chunked upsert — one 20k-row insert would blow the request limit, and
  // on-conflict makes a same-day re-run idempotent instead of duplicating.
  let stored = 0;
  const CHUNK = 500;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { error } = await db
      .from("lead_status_snapshots")
      .upsert(slice, { onConflict: "snapshot_date,lead_id" });
    if (error) {
      // A missing table is the one failure worth naming precisely — it means the
      // migration in supabase/lead-status-snapshots.sql hasn't been run yet.
      if (/relation .* does not exist/i.test(error.message)) {
        throw new Error("lead_status_snapshots table is missing — run supabase/lead-status-snapshots.sql in the Supabase SQL editor first");
      }
      throw new Error(error.message);
    }
    stored += slice.length;
  }

  return { scanned: rows.length, stored, skippedClosed, ...(truncated ? { truncated: true } : {}) };
}
