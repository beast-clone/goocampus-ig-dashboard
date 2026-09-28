// Every status a task can hold, in pipeline order.
//
// This is the mh_status enum. A value outside it is rejected by Postgres, which
// surfaces as an opaque 502, so anything that writes a status checks against this
// first.
//
// There are older copies of this list in lib/airtable-import.ts, MarketingHub.tsx
// and PreviewMyDay.tsx. New code should use this one; those are worth folding in
// next time they are touched.
export const TASK_STATUSES = [
  "Content - Pending",
  "Content - In Progress",
  "Content - Needs Approval",
  "Content - Approved",
  "Output - In Progress",
  "Incorporating Feedback",
  "Output - Ready",
  "Ready to Publish",
  "Published/Scheduled",
  "Rejected/Not Published",
  "Failed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Where a task starts when nobody says otherwise. */
export const DEFAULT_STATUS: TaskStatus = "Content - Pending";

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}
