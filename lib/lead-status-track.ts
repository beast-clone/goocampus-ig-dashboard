// Lead status tracking — because Airtable overwrites Lead Status in place and does
// not expose field-revision history, the only way to know WHEN a lead changed stage
// is to record it ourselves. A nightly job (app/api/cron/lead-status-snapshot) reads
// the leads modified since the last run, compares each one's current status to what
// we last saw, and appends a status-change event. From that we can show "first
// contacted" and time-to-contact going forward (it can't backfill the past).
//
// Stored in `discover_cache` (no migration): one row per lead, key `leadtrack:<id>`,
// source `lead_status_track`, payload = { last, counsellor, events[], updatedAt }.

import { getSupabase } from "@/lib/supabase";

type SB = NonNullable<ReturnType<typeof getSupabase>>;

export type StatusEvent = { at: string; from: string; to: string };
export type LeadTrack = { last: string; counsellor?: string; events: StatusEvent[]; updatedAt: string };

export const SOURCE = "lead_status_track";
export const trackKey = (leadId: string) => `leadtrack:${leadId}`;
const META_KEY = "leadtrack:_meta";

// Intake / pool statuses — a lead is "not yet worked" while it sits in one of these.
// "First contact" is the moment it first leaves them for any worked stage.
export const NEW_STATUSES = new Set(["", "New", "Open Leads", "Office enquiry", "SQL", "Re-Enquiry", "Bookings"]);

// The first moment the lead left the intake statuses — i.e. first got worked.
export function firstContactAt(events: StatusEvent[]): string | null {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const e of sorted) if (!NEW_STATUSES.has(e.to)) return e.at;
  return null;
}

export async function getLeadTrack(sb: SB, leadId: string): Promise<LeadTrack | null> {
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", trackKey(leadId)).maybeSingle();
  return (data?.payload as LeadTrack) ?? null;
}

export async function getLastRun(sb: SB): Promise<string | null> {
  const { data } = await sb.from("discover_cache").select("payload").eq("cache_key", META_KEY).maybeSingle();
  return (data?.payload as { lastRunAt?: string })?.lastRunAt ?? null;
}

export async function setLastRun(sb: SB, at: string): Promise<void> {
  await sb.from("discover_cache").upsert(
    { cache_key: META_KEY, source: SOURCE, last_fetched: at, payload: { lastRunAt: at } },
    { onConflict: "cache_key" },
  );
}
