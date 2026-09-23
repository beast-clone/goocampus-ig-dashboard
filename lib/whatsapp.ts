// WhatsApp broadcast — shared bits for the Community Broadcast tab and its API.
// The dashboard only queues; n8n + WAHA (private VPS network) do the sending.

export type WaStatus = "scheduled" | "sending" | "sent" | "delivered" | "failed" | "canceled";

/** What the worker should send. All three ride in the same queue. */
export type WaKind = "message" | "poll" | "status";

/** WhatsApp's own chat id for a Status (story) — not a real chat. */
export const STATUS_CHAT = "status@broadcast";

export type WaPoll = { name: string; options: string[]; multipleAnswers: boolean };

/** How often a message repeats. "none" and a missing rule mean the same thing. */
export type WaRepeatRule = "none" | "daily" | "weekly" | "monthly";
export type WaRepeat = {
  rule: WaRepeatRule;
  until: string | null;
  /**
   * The day of the month the series was created on, for monthly repeats.
   *
   * Without it a monthly series drifts: the 31st clamps to 28 in February and
   * then every later month is computed from the 28th, so "the 31st of every
   * month" quietly becomes "the 28th" forever. Anchoring on the original day
   * keeps Jan 31 → Feb 28 → Mar 31.
   */
  anchorDay?: number | null;
};

export const REPEAT_LABEL: Record<WaRepeatRule, string> = {
  none: "Does not repeat", daily: "Every day", weekly: "Every week", monthly: "Every month",
};

/**
 * When the next one goes out.
 *
 * Monthly keeps the day of the month, and JS rolls 31 Feb into March — so a
 * monthly message set for the 31st would drift forward a few days every time.
 * Clamp it to the last day of the shorter month instead, which is what a person
 * means by "the 31st, every month".
 */
export function nextOccurrence(iso: string, rule: WaRepeatRule, anchorDay?: number | null): Date | null {
  if (!rule || rule === "none") return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const next = new Date(d);
  if (rule === "daily") next.setDate(next.getDate() + 1);
  else if (rule === "weekly") next.setDate(next.getDate() + 7);
  else {
    // Always aim at the day the series started on, not the day this one landed on.
    const day = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : d.getDate();
    next.setDate(1);                       // avoid rolling over while changing month
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));  // February gets the 28th, March gets the 31st back
  }
  return next;
}

/** The repeat on a message, whatever shape the row is in. */
export function repeatOf(payload: { repeat?: WaRepeat } | null | undefined): WaRepeat | null {
  const r = payload?.repeat;
  if (!r || !r.rule || r.rule === "none") return null;
  return { rule: r.rule, until: r.until || null, anchorDay: r.anchorDay ?? null };
}

export const WA_STATUSES: WaStatus[] = ["scheduled", "sending", "sent", "delivered", "failed", "canceled"];

export type WaMessage = {
  id: string;
  chat_id: string;
  chat_label: string | null;
  body: string | null;
  image_url: string | null;
  schedule_time: string;
  status: WaStatus;
  kind: WaKind;
  payload: { poll?: WaPoll; repeat?: WaRepeat } | null;
  wa_message_id: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  sent_at: string | null;
};

export const WA_COLS =
  "id, chat_id, chat_label, body, image_url, schedule_time, status, kind, payload, wa_message_id, error, created_by, created_at, sent_at";

export type ChatKind = "contact" | "group" | "channel";

/** What a chat id is, read off its suffix — that is all WhatsApp gives us. */
export function chatKind(chatId: string): ChatKind {
  const id = (chatId || "").toLowerCase();
  if (id === STATUS_CHAT) return "channel";           // Status behaves like a broadcast
  if (id.endsWith("@g.us")) return "group";          // groups, incl. a community's Announcements group
  if (id.endsWith("@newsletter")) return "channel";  // WhatsApp Channels
  return "contact";
}

// A phone number typed on its own is the common case, so accept it and add the
// suffix. Anything already carrying a suffix is passed through untouched.
const DIGITS = /^\+?[0-9][0-9\s-]{6,19}$/;

/** "+91 88928 69798" → "918892869798@c.us". Returns null when it can't be one. */
export function normalizeChatId(raw: string): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  if (/@(c\.us|g\.us|newsletter|lid)$/i.test(v)) return v.replace(/\s+/g, "");
  if (DIGITS.test(v)) {
    const digits = v.replace(/[^0-9]/g, "");
    // 10 digits = an Indian number typed without its country code.
    return `${digits.length === 10 ? `91${digits}` : digits}@c.us`;
  }
  return null;
}

/** The number/id to show when there is no saved name. */
export function chatDisplay(chatId: string): string {
  if (chatId === STATUS_CHAT) return "My Status";
  const [left] = (chatId || "").split("@");
  if (chatKind(chatId) === "contact" && /^[0-9]+$/.test(left)) return `+${left}`;
  return chatId;
}
