// When the n8n publisher next looks at the queue. Publisher v3 (RssNBI5xb6F3gIH4)
// runs every minute from 6:00 to 23:59 IST (cron * 6-23), so a post due at 00:30
// waits for 6:00. It sends a post's file to Instagram / Facebook / LinkedIn up to
// SEND_AHEAD_MIN before its time, and only presses "post" at the time (22 Oct).
// Shared by the queue (so a waiting post isn't called "stuck") and the Scheduler's
// live countdown.
const IST_MS = 5.5 * 3600_000;
const EVERY = 60_000;   // the run interval (was 5 min before v3)
export const SEND_AHEAD_MIN = 30;

/** The first publisher run at or after `fromMs`. */
export function nextPublisherCheck(fromMs: number): number {
  const ist = fromMs + IST_MS;
  let next = Math.ceil(ist / EVERY) * EVERY;   // IST wall-clock, as UTC fields
  const h = new Date(next).getUTCHours();
  if (h < 6) {
    const d = new Date(next); d.setUTCHours(6, 0, 0, 0); next = d.getTime();
  }
  return next - IST_MS;
}

/** "4:05" / "1:02:30" — for countdowns and elapsed time. */
export function clockText(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "4 min 20 s" / "1 h 5 min" — for durations that have finished. */
export function durationText(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000));
  if (t < 60) return `${t} s`;
  const m = Math.floor(t / 60);
  if (m < 60) return t % 60 ? `${m} min ${t % 60} s` : `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
