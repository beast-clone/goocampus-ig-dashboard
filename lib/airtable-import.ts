// One-way import: Airtable's Content Calendar → the Supabase master sheet (mh_posts).
//
// Airtable is where the team plans. This copies a window of that plan into the
// dashboard so the master sheet, calendar and scheduler are working from the same
// content — without anyone re-typing it.
//
// Deliberately manual. A background sync that runs on its own has to answer "which
// side wins" every minute, forever; a button pressed by a person answers it once,
// visibly, for a range they chose.
//
// Direction is one way. Nothing here writes back to Airtable.

import { airtableList, CONTENT_CALENDAR_TABLE } from "@/lib/marketing-hub";
import { getSupabase } from "@/lib/supabase";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { trashedAirtableIds } from "@/lib/task-trash";

// Supabase's mh_status is an enum of 8; Airtable's Status offers 11. Writing one of
// the extra three fails the whole row with an opaque Postgres error, so they are
// mapped to their nearest equivalent — and the original is kept in
// custom.airtable_status so nothing is silently rewritten out of existence.
const STATUS_MAP: Record<string, string> = {
  "content - needs approval": "Content - In Progress",
  "rejected/not published": "Incorporating Feedback",
  "failed": "Incorporating Feedback",
};
const VALID_STATUS = new Set([
  "Content - Pending", "Content - In Progress", "Content - Approved", "Output - In Progress",
  "Incorporating Feedback", "Output - Ready", "Ready to Publish", "Published/Scheduled",
]);

// Airtable stores the owner as a collaborator record; the dashboard keys people by
// a short name. Same map the create route uses.
const OWNER_ALIASES: Record<string, string> = {
  "manya b m": "manya", "manya": "manya",
  "praveen l": "praveen", "praveen": "praveen",
  "nikhil shyamraj": "nikhil", "nikhi shyamraj": "nikhil", "nikhil": "nikhil",
  "nandu c": "nandu", "nandu": "nandu",
  "maheen ejaz": "maheen", "maheen": "maheen",
};

/** The Airtable fields we read. Everything else on the record is left behind. */
type CalendarFields = {
  "Particulars"?: string;
  "Type"?: string;
  "Status"?: string;
  "SBU"?: string;
  "Content"?: string;
  "Caption"?: string;
  "Additional Info"?: string;
  "Publishing Date"?: string;
  "Due Date"?: string;
  "Completion Time"?: string;
  "Priority"?: string;
  "Platform(s)"?: string[];
  "Publish To"?: string;
  "Publish To Page"?: string;
  "Needs Review"?: boolean;
  "Synced to Scheduler"?: boolean;
  "Output Link"?: string;
  "Instagram URL"?: string;
  "Facebook URL"?: string;
  "Link"?: string;
  "Slack Link"?: string;
  "Start Date & Time"?: string;
  "End Date & Time"?: string;
  "References"?: string;
  "Owner"?: { id?: string; email?: string; name?: string };
  "Collaborators"?: { id?: string; email?: string; name?: string }[];
  "Created by"?: { id?: string; email?: string; name?: string };
  "Attachments"?: { url?: string; type?: string }[];
};

// Optional narrowing on top of the date range, the way the team filters Airtable:
// any of the picked values within a field, all fields together.
export const IMPORT_FILTER_KEYS = ["owner", "collaborators", "type", "status", "sbu"] as const;
export type ImportFilterKey = (typeof IMPORT_FILTER_KEYS)[number];
export type ImportFilters = Partial<Record<ImportFilterKey, string[]>>;
export type ImportFacets = Record<ImportFilterKey, { value: string; count: number }[]>;

// People who are still on Airtable records but aren't on the team; left out of the
// Owner / Collaborators filters (a record that only has them counts as "No collaborators").
const HIDDEN_PEOPLE = new Set(["shubhi gupta", "sramana giri"]);
const shown = (name: string | null) => !!name && !HIDDEN_PEOPLE.has(name.toLowerCase());

// The team, spelled as Airtable spells them. Always offered in the Owner and
// Collaborators filters, with 0 when they have nothing in the chosen dates.
const TEAM_PEOPLE = ["Praveen L", "Nandu C", "Manya B M", "NIKHI Shyamraj"];

// Values a record carries per filter field, as Airtable spells them.
function valuesOf(f: CalendarFields, key: ImportFilterKey): string[] {
  switch (key) {
    case "owner": { const o = str(f["Owner"]?.name); return [shown(o) ? o as string : "No owner"]; }
    case "collaborators": { const c = (f["Collaborators"] || []).map((x) => str(x?.name)).filter((x): x is string => shown(x)); return c.length ? c : ["No collaborators"]; }
    case "type": return [str(f["Type"]) || "No type"];
    case "status": return [str(f["Status"]) || "No status"];
    case "sbu": return [str(f["SBU"]) || "No interest"];
  }
}

export type ImportResult = {
  /** Records in the date range, before filters. */
  inRange: number;
  facets: ImportFacets;
  scanned: number;
  created: number;
  updated: number;
  skipped: { reason: string; count: number }[];
  errors: string[];
};

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

/**
 * A record already published from the dashboard is not re-imported over the top.
 * Airtable does not know the permalink, the cover or the insight ids, and
 * overwriting a live post with the plan that preceded it loses all three.
 */
const PROTECTED_STATUSES = new Set(["published", "publishing"]);

// The import reads one Airtable view, not the whole table: the team curates what
// belongs in the dashboard with that view's filters (status, owner, collaborators,
// publishing date), so changing the view in Airtable changes what gets imported.
// A dropped connection surfaces from fetch as "terminated" / "fetch failed" with the
// real reason (EHOSTUNREACH, ECONNRESET…) on err.cause — meaningless to a person.
export const LOST_CONNECTION = "Lost connection to Airtable/Supabase. Nothing was imported — try again.";
export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { cause?: { code?: string } })?.cause?.code || "";
  return /terminated|fetch failed|socket hang up|network/i.test(msg)
    || /^E(HOSTUNREACH|CONNRESET|CONNREFUSED|TIMEDOUT|NOTFOUND|AI_AGAIN|PIPE)$|^UND_ERR/.test(code);
}

export const IMPORT_VIEW = { id: "viwNk7D0PPWMNh3Im", name: "Task Dashboard" };

export async function importFromAirtable(opts: {
  /** Optional inclusive "YYYY-MM-DD" bounds on Publishing Date, on top of the view. */
  from?: string;
  to?: string;
  /** Preview only — count what would happen, write nothing. */
  dryRun?: boolean;
  filters?: ImportFilters;
  /** Just read the range and report the filter options — no counting, no writes. */
  facetsOnly?: boolean;
}): Promise<ImportResult> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase not configured");

  const out: ImportResult = { inRange: 0, facets: { owner: [], collaborators: [], type: [], status: [], sbu: [] }, scanned: 0, created: 0, updated: 0, skipped: [], errors: [] };
  const skip = (reason: string) => {
    const row = out.skipped.find((s) => s.reason === reason);
    if (row) row.count += 1; else out.skipped.push({ reason, count: 1 });
  };

  // IS_AFTER/IS_BEFORE are exclusive, so the range is widened by a day at each end
  // and the exact comparison is done here — an off-by-one on a date range quietly
  // drops the first and last day of the month somebody asked for.
  const bounds = [
    opts.from ? `IS_AFTER({Publishing Date}, DATEADD('${opts.from}', -1, 'days'))` : "",
    opts.to ? `IS_BEFORE({Publishing Date}, DATEADD('${opts.to}', 1, 'days'))` : "",
  ].filter(Boolean);

  const all = await airtableList<CalendarFields>(CONTENT_CALENDAR_TABLE, {
    view: IMPORT_VIEW.id,
    ...(bounds.length ? { filterByFormula: `AND(${bounds.join(", ")})` } : {}),
    sort: [{ field: "Publishing Date", direction: "asc" }],
  });
  out.inRange = all.length;
  for (const key of IMPORT_FILTER_KEYS) {
    const n = new Map<string, number>();
    if (key === "owner" || key === "collaborators") for (const p of TEAM_PEOPLE) n.set(p, 0);
    for (const r of all) for (const v of new Set(valuesOf(r.fields, key))) n.set(v, (n.get(v) || 0) + 1);
    out.facets[key] = [...n].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }
  const active = IMPORT_FILTER_KEYS.filter((k) => opts.filters?.[k]?.length);
  const records = all.filter((r) => active.every((k) => valuesOf(r.fields, k).some((v) => opts.filters![k]!.includes(v))));
  out.scanned = records.length;
  if (records.length === 0 || opts.facetsOnly) return out;

  // One read of everything already here, rather than a query per record.
  const ids = records.map((r) => r.id);
  const existing = new Map<string, { id: string; publish_status: string | null; custom: Record<string, unknown> | null; created_by: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from("mh_posts")
      .select("id, airtable_record_id, publish_status, custom, created_by")
      .in("airtable_record_id", ids.slice(i, i + 200));
    if (error) throw new Error(`Reading existing rows failed: ${error.message}`);
    for (const row of data || []) {
      if (row.airtable_record_id) existing.set(row.airtable_record_id, { id: row.id, publish_status: row.publish_status, custom: row.custom, created_by: row.created_by });
    }
  }

  // Anything sitting in the recycle bin was deleted on purpose — don't re-import it.
  // Restore it from the bin instead if it's wanted back.
  const binned = await trashedAirtableIds(db);

  for (const rec of records) {
    const f = rec.fields;
    const particulars = str(f["Particulars"]);
    if (!particulars) { skip("no title in Airtable"); continue; }
    if (binned.has(rec.id)) { skip("in the recycle bin"); continue; }

    const media = (f["Attachments"] || [])
      .map((a) => a?.url)
      .filter((u): u is string => typeof u === "string" && u.startsWith("http"));

    const rawStatus = str(f["Status"]);
    const mapped = rawStatus
      ? (VALID_STATUS.has(rawStatus) ? rawStatus : STATUS_MAP[rawStatus.toLowerCase()] || "Content - Pending")
      : "Content - Pending";
    const ownerName = str(f["Owner"]?.name);

    const row: Record<string, unknown> = {
      airtable_record_id: rec.id,
      particulars,
      type: str(f["Type"]),
      status: mapped,
      owner_key: ownerName ? OWNER_ALIASES[ownerName.toLowerCase()] || null : null,
      sbu: str(f["SBU"]),
      content: str(f["Content"]),
      caption: str(f["Caption"]),
      additional_info: str(f["Additional Info"]),
      publishing_date: str(f["Publishing Date"]),
      due_date: str(f["Due Date"]),
      completion_time: str(f["Completion Time"]),
      priority: str(f["Priority"]),
      platforms: f["Platform(s)"]?.length ? f["Platform(s)"] : null,
      publish_to: str(f["Publish To"]),
      publish_to_page: str(f["Publish To Page"]),
      needs_review: Boolean(f["Needs Review"]),
      synced_to_scheduler: Boolean(f["Synced to Scheduler"]),
      output_link: str(f["Output Link"]),
      instagram_url: str(f["Instagram URL"]),
      facebook_url: str(f["Facebook URL"]),
      external_link: str(f["Link"]),
      slack_link: str(f["Slack Link"]),
      start_at: str(f["Start Date & Time"]),
      end_at: str(f["End Date & Time"]),
      // text[] in Postgres, not text — a bare string is rejected and the row is lost.
      reference_links: str(f["References"]) ? [str(f["References"]) as string] : null,
      // Attachments only fill media_urls when Airtable actually has some, so an
      // import never blanks creatives that were uploaded in the dashboard.
      ...(media.length ? { media_urls: media } : {}),
      updated_at: new Date().toISOString(),
    };

    const hit = existing.get(rec.id);
    // Creator = Airtable's "Created by", set once: on insert, or to fill a row that has
    // none. Never overwrites a creator the dashboard already recorded.
    const creatorName = str(f["Created by"]?.name);
    const creator = creatorName ? OWNER_ALIASES[creatorName.toLowerCase()] || null : null;
    if (creator && !hit?.created_by) row.created_by = creator;
    // Keep Airtable's own wording when it had no Supabase equivalent, and never
    // clobber the rest of an existing row's custom object.
    row.custom = {
      ...((hit?.custom as Record<string, unknown>) || {}),
      ...(rawStatus && rawStatus !== mapped ? { airtable_status: rawStatus } : {}),
    };
    if (opts.dryRun) {
      if (hit && PROTECTED_STATUSES.has(String(hit.publish_status || "").toLowerCase())) skip("already published here");
      else if (hit) out.updated += 1;
      else out.created += 1;
      continue;
    }

    try {
      if (hit) {
        if (PROTECTED_STATUSES.has(String(hit.publish_status || "").toLowerCase())) { skip("already published here"); continue; }
        const { error } = await db.from("mh_posts").update(row).eq("id", hit.id);
        if (error) throw new Error(error.message);
        out.updated += 1;
      } else {
        const { error } = await db.from("mh_posts").insert({ ...row, created_at: new Date().toISOString() });
        if (error) throw new Error(error.message);
        out.created += 1;
      }
    } catch (e) {
      // One bad record must not abandon the other four thousand.
      if (out.errors.length < 10) out.errors.push(`${particulars}: ${isNetworkError(e) ? "lost connection — try again" : (e as Error).message}`);
    }
  }

  // The hub read endpoint caches for 12 hours. Without this an import appears to
  // have done nothing until the TTL expires.
  if (!opts.dryRun && (out.created || out.updated)) bustMarketingHubCache();
  return out;
}
