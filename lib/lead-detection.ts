// Shared lead-detection rules. Used by DM thread classification and (later) Inbox.
// Goal: only flag as "verified lead" when the OTHER PARTY shared real contact info
// or expressed concrete buying intent. Outbound auto-DMs do NOT count.

export type LeadMatch = {
  matched: true;
  kind: "phone" | "email" | "whatsapp" | "telegram" | "intent";
  evidence: string; // short snippet that triggered the match
} | { matched: false };

// Indian + international phone numbers. Min 9 digits, max 15.
// Allows +91, country code, spaces, dashes, parentheses.
const PHONE_RE = /(?:\+?\d[\d\s\-()]{7,18}\d)/;

// Basic email — good enough; not RFC-strict.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

const WHATSAPP_RE = /\b(wa\.me\/|whatsapp\.com\/|my whats?app|whats?app number|whatsapp me)/i;
const TELEGRAM_RE = /\b(t\.me\/|telegram\.me\/|my telegram|telegram me)/i;

// Concrete buying intent — must be specific. "Interested" alone is too weak.
const INTENT_RE = /\b(send me details?|share details?|share (the )?(brochure|link)|how to (apply|enroll|register|join)|enroll me|register me|sign me up|book a call|call me back|please call|i want to (apply|enroll|join))\b/i;

// Words that mean "this is OUR outbound message" — never trust them as leads
// even if found in the text (auto-DMs often quote phone/email).
const OUTBOUND_HINT = /\b(thank you for your interest|secure your copy|book your slot|join our (whatsapp|telegram) (group|channel))/i;

function clean(t: string): string {
  return (t || "").trim();
}

function snippet(t: string, around: string, len = 60): string {
  const i = t.toLowerCase().indexOf(around.toLowerCase());
  if (i < 0) return t.slice(0, len);
  const start = Math.max(0, i - 15);
  return (start > 0 ? "…" : "") + t.slice(start, start + len) + (start + len < t.length ? "…" : "");
}

export function detectLeadInText(text: string): LeadMatch {
  const t = clean(text);
  if (!t) return { matched: false };

  // Skip our own outbound copy patterns
  if (OUTBOUND_HINT.test(t)) return { matched: false };

  const phone = t.match(PHONE_RE);
  if (phone) {
    // Reject digit strings that look like timestamps or IDs (e.g. all same digit, too many digits).
    const digits = phone[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15 && new Set(digits).size > 2) {
      return { matched: true, kind: "phone", evidence: snippet(t, phone[0]) };
    }
  }

  const email = t.match(EMAIL_RE);
  if (email) return { matched: true, kind: "email", evidence: snippet(t, email[0]) };

  if (WHATSAPP_RE.test(t)) return { matched: true, kind: "whatsapp", evidence: snippet(t, t.match(WHATSAPP_RE)![0]) };
  if (TELEGRAM_RE.test(t)) return { matched: true, kind: "telegram", evidence: snippet(t, t.match(TELEGRAM_RE)![0]) };

  if (INTENT_RE.test(t)) return { matched: true, kind: "intent", evidence: snippet(t, t.match(INTENT_RE)![0]) };

  return { matched: false };
}

// Classify a thread by walking its INBOUND messages only.
// Returns the strongest match found, or { matched: false }.
export function classifyThread(messages: { direction: "in" | "out"; text: string }[]): LeadMatch {
  // Priority: phone > email > whatsapp > telegram > intent
  const priority = { phone: 5, email: 4, whatsapp: 3, telegram: 2, intent: 1 };
  let best: LeadMatch = { matched: false };
  let bestScore = 0;
  for (const m of messages) {
    if (m.direction !== "in") continue;
    const r = detectLeadInText(m.text);
    if (r.matched && priority[r.kind] > bestScore) {
      best = r;
      bestScore = priority[r.kind];
      if (bestScore === 5) break; // can't beat phone
    }
  }
  return best;
}
