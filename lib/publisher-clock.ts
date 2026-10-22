// When the n8n publisher (frQoNFQjqVSnZsTp) next looks at the queue. It runs every 5
// minutes from 6:00 to 23:55 IST (cron */5 6-23), so a post due at 00:30 waits for
// 6:00. Shared by the queue (so a waiting post isn't called "stuck") and the
// Scheduler's live countdown.
const IST_MS = 5.5 * 3600_000;
const FIVE_MIN = 5 * 60_000;

/** The first publisher run at or after `fromMs`. */
export function nextPublisherCheck(fromMs: number): number {
  const ist = fromMs + IST_MS;
  let next = Math.ceil(ist / FIVE_MIN) * FIVE_MIN;   // IST wall-clock, as UTC fields
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
