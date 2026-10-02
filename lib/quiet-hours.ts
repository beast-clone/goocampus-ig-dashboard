// The overnight stop zone: 00:00–06:00 IST, nothing runs.
//
// Two things used to make calls around the clock — the n8n cron jobs, and the
// dashboard's own background polling in whatever browser tab someone left open.
// Both are pointless between midnight and six: nobody is reading the screen and
// no source (Instagram, Airtable, the notice boards) publishes anything that
// cannot wait until morning. Every call in that window is spend for nothing.
//
// The n8n side is enforced by the schedules themselves (see docs/CRON_JOBS.md).
// This file is the browser side. It does NOT block anything a person actually
// asks for — open a page at 2 am and it loads, hit Refresh and it refreshes.
// It only stops the timers that fire on their own.

export const QUIET_FROM_HOUR = 0;  // inclusive — 00:00 IST
export const QUIET_TO_HOUR = 6;    // exclusive — 06:00 IST

/** The hour of day in India right now, wherever the browser happens to be. */
export function istHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false,
  }).format(now);
  return Number(h) % 24;
}

/** True between midnight and 6 am IST. */
export function isQuietHours(now: Date = new Date()): boolean {
  const h = istHour(now);
  return h >= QUIET_FROM_HOUR && h < QUIET_TO_HOUR;
}

/**
 * The one check every background poller should make before firing.
 * False when the tab is hidden (nobody is looking) or during the stop zone.
 */
export function shouldPoll(): boolean {
  if (typeof document !== "undefined" && document.hidden) return false;
  return !isQuietHours();
}
