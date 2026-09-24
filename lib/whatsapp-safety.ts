// Keeping the WhatsApp number alive.
//
// WhatsApp publishes NO messages-per-hour or per-day limit for a Business app
// account — every number online is guesswork, and the sources disagree tenfold.
// Bans come from reports and behaviour, not a counter. So none of this is
// "compliance": it is about not looking like a bulk sender.
//
// What IS documented, and what these rules are built on:
//   · WhatsApp bans for messaging people who never contacted you, for bulk or
//     automated sending, and for broadcasts that get reported.
//   · Only 1:1 messages to NEW contacts are actually quota-limited by WhatsApp.
//     A group or channel post is one send reaching everyone — far safer.
//   · WAHA's own guidance: never a fixed gap between sends, always a random
//     30–60 seconds.
//
// The thresholds below are the community's rules of thumb, not law. They are
// here so they can be argued with in one place, and they only ever WARN — a
// person can always go ahead.

export const WA_SAFETY = {
  /** Random gap between two sends in the same batch, in seconds (WAHA's advice). */
  gapMinSec: 30,
  gapMaxSec: 60,
  /** Rules of thumb for a number that has been running a while. */
  perHour: 50,
  perDay: 300,
  /** Quiet hours, IST. A marketing message at 11pm is what gets reported. */
  quietFromHour: 21,
  quietToHour: 9,
  /** Above this many individual recipients, suggest the group instead. */
  sameTextAt: 20,
};

export type WaWarning = { key: string; text: string };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * When a message goes to several recipients, spread them out instead of firing
 * them all in the same minute. Random, never a fixed cadence — a metronome is
 * exactly what automation detection looks for.
 */
export function spreadSchedule(startISO: string, count: number): string[] {
  const start = new Date(startISO).getTime();
  const out: string[] = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    out.push(new Date(t).toISOString());
    t += Math.round(rnd(WA_SAFETY.gapMinSec, WA_SAFETY.gapMaxSec)) * 1000;
  }
  return out;
}

/** How long a batch of this size will take, in plain words. */
export function spreadLabel(count: number): string | null {
  if (count < 2) return null;
  const mid = (WA_SAFETY.gapMinSec + WA_SAFETY.gapMaxSec) / 2;
  const mins = Math.round(((count - 1) * mid) / 60);
  if (mins < 1) return "sent a few seconds apart";
  return `spread over about ${mins} minute${mins === 1 ? "" : "s"}, 30–60 seconds apart`;
}

const istHour = (d: Date) => Number(d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }));
const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/**
 * Everything worth saying before a batch goes out. Order matters: the busiest
 * warning first, because that is the one that gets a number banned.
 */
export function checkBatch(opts: {
  at: Date;                       // when the first message goes
  count: number;                  // how many recipients in this batch
  existing: { schedule_time: string; status: string }[];  // what is already queued/sent
  kind: "message" | "poll" | "status";
  toGroups: number;               // how many of the recipients are groups/channels
}): WaWarning[] {
  const { at, count, existing, kind, toGroups } = opts;
  const out: WaWarning[] = [];
  if (kind === "status") return out;          // a status is one post, not a fan-out

  const live = existing.filter((r) => r.status !== "canceled" && r.status !== "failed");
  const hourStart = at.getTime() - 60 * 60_000;
  const inHour = live.filter((r) => {
    const t = new Date(r.schedule_time).getTime();
    return t > hourStart && t <= at.getTime() + 60 * 60_000;
  }).length;
  const inDay = live.filter((r) => istDay(new Date(r.schedule_time)) === istDay(at)).length;

  if (inHour + count > WA_SAFETY.perHour) {
    out.push({
      key: "hour",
      text: `That puts ${inHour + count} messages in one hour. Around ${WA_SAFETY.perHour} is the most people consider safe — the rest is better moved to another time.`,
    });
  }
  if (inDay + count > WA_SAFETY.perDay) {
    out.push({
      key: "day",
      text: `That makes ${inDay + count} messages today. Beyond roughly ${WA_SAFETY.perDay} in a day, numbers start getting flagged.`,
    });
  }
  const h = istHour(at);
  if (h >= WA_SAFETY.quietFromHour || h < WA_SAFETY.quietToHour) {
    out.push({
      key: "quiet",
      text: "That time is outside working hours. A marketing message late at night is the one people report — between 9am and 9pm is safer.",
    });
  }
  const individuals = count - toGroups;
  if (individuals >= WA_SAFETY.sameTextAt) {
    out.push({
      key: "fanout",
      text: `The same message is going to ${individuals} people one by one. WhatsApp only limits messages to individuals — posting it to a group instead is one send, and counts for nothing against your number.`,
    });
  }
  return out;
}
