// Lead-stage vocabulary, kept free of any server-only imports so client components
// can use it. lib/lead-assignment.ts reaches Airtable (and through it `fs`), so a
// component importing this from there would drag the whole server chain into the
// browser bundle and fail the build.

// Stages a lead never comes back from. Verified against the live CRM — these are
// the exact values in use, not guesses. Anything unknown counts as still workable,
// so a new stage name shows up rather than silently disappearing.
export const CLOSED_STATUSES = new Set([
  "Junk lead", "Not interested", "Not eligible", "Closed won", "Closed lost",
]);

export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(status);
}
