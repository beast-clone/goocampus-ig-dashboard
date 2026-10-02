// WhatsApp template pre-flight — what will probably get this rejected, and which
// category Meta will probably file it under.
//
// This is OUR opinion, never Meta's verdict. There is no API that previews a decision;
// the only way to know is to submit. What this does is catch the things that cause most
// rejections before the submit, so the loop of reject-fix-resubmit gets shorter.
//
// Everything here is deterministic and offline. The AI pass in the route adds judgement
// and a rewrite on top; it does not replace these, because a structural error is a fact
// and should not be left to a model to notice.

export type Severity = "blocker" | "risk" | "note";
export type Finding = { severity: Severity; what: string; why: string };
export type Category = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export type TemplateDraft = {
  name: string;
  category: Category;      // what you intend to submit it as
  header?: string;
  body: string;
  footer?: string;
  buttons?: string[];
};

export type CheckResult = {
  findings: Finding[];
  likely: Category;
  categoryWhy: string[];
  marketingHits: string[];
  utilityHits: string[];
  vars: number[];
  /** Our estimate of the chance Meta takes it as submitted. Never 0 or 100 — we
   *  do not get a vote, and pretending to certainty either way would be a lie. */
  score: number;
  scoreWhy: string;
};

// Meta's own limits, as published.
const MAX_BODY = 1024;
const MAX_HEADER = 60;
const MAX_FOOTER = 60;
const MAX_BUTTON = 25;

// Words that drag a template into Marketing. A template submitted as Utility that reads
// like any of these is the single most common reason for the reject-resubmit loop: Meta
// silently reclassifies it rather than explaining, so it looks like a rejection for no
// reason. Tuned for counselling: "new batch" and "admission open" are the local traps.
const MARKETING_WORDS = [
  "offer", "discount", "sale", "deal", "free", "bonus", "cashback", "coupon", "promo",
  "limited time", "limited seats", "last chance", "hurry", "don't miss", "dont miss",
  "exclusive", "special price", "best price", "save now",
  "enroll", "enrol", "apply now", "register now", "join now", "book now", "sign up",
  "admission open", "admissions open", "new batch", "batch starts", "seats filling",
  "webinar", "masterclass", "demo class", "counselling session", "free consultation",
  "upgrade", "subscribe", "refer", "launch", "introducing", "announcing",
];

// Words that genuinely indicate Utility — something the person already did. A Utility
// template with none of these is usually Marketing wearing a disguise.
const UTILITY_WORDS = [
  "your order", "your payment", "your booking", "your appointment", "your application",
  "your request", "your ticket", "your invoice", "your receipt", "your enquiry",
  "confirmed", "confirmation", "received", "processed", "shipped", "delivered",
  "scheduled for", "rescheduled", "cancelled", "refund", "due on", "expires on",
  "reference number", "transaction", "status update",
];

const found = (hay: string, words: string[]) =>
  words.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(hay));

export function checkTemplate(t: TemplateDraft): CheckResult {
  const f: Finding[] = [];
  const body = (t.body || "").trim();
  const header = (t.header || "").trim();
  const footer = (t.footer || "").trim();
  const buttons = (t.buttons || []).map((b) => b.trim()).filter(Boolean);

  // ── the name ────────────────────────────────────────────────────────────────
  if (t.name.trim() && !/^[a-z0-9_]+$/.test(t.name)) {
    f.push({
      severity: "blocker",
      what: "Template name has characters Meta won't take",
      why: "Lowercase letters, numbers and underscores only — no spaces, capitals or punctuation.",
    });
  }

  // ── the body ────────────────────────────────────────────────────────────────
  if (!body) {
    f.push({ severity: "blocker", what: "Body is empty", why: "Nothing to submit." });
  }
  if (body.length > MAX_BODY) {
    f.push({
      severity: "blocker",
      what: `Body is ${body.length} characters`,
      why: `The limit is ${MAX_BODY}. Anything longer is rejected outright.`,
    });
  }

  // ── the variables, which cause most structural rejections ───────────────────
  const vars = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const expected = vars.map((_, i) => i + 1);
  if (vars.length && vars.join(",") !== expected.join(",")) {
    f.push({
      severity: "blocker",
      what: `Variables are numbered ${vars.join(", ") || "—"}`,
      why: `They must run 1, 2, 3 in order with none skipped. Expected ${expected.join(", ")}.`,
    });
  }
  if (/^\s*\{\{\d+\}\}/.test(body)) {
    f.push({
      severity: "blocker",
      what: "The body starts with a variable",
      why: "Meta rejects a template that opens with {{1}} — there has to be real text first.",
    });
  }
  if (/\{\{\d+\}\}\s*$/.test(body)) {
    f.push({
      severity: "blocker",
      what: "The body ends with a variable",
      why: "Same rule at the end — put a word, or a full stop, after it.",
    });
  }
  if (/\{\{\d+\}\}[\s]*\{\{\d+\}\}/.test(body)) {
    f.push({
      severity: "blocker",
      what: "Two variables sit next to each other",
      why: "Meta rejects {{1}} {{2}} with nothing between them. Put a word between.",
    });
  }
  if (!vars.length) {
    f.push({
      severity: "note",
      what: "No variables",
      why: "One template with {{1}} and {{2}} covers many messages. Without them you need a new template for every variation — and a new approval each time.",
    });
  }

  // ── header, footer, buttons ─────────────────────────────────────────────────
  if (header.length > MAX_HEADER) {
    f.push({ severity: "blocker", what: `Header is ${header.length} characters`, why: `The limit is ${MAX_HEADER}.` });
  }
  if (/\n/.test(header)) {
    f.push({ severity: "blocker", what: "Header has a line break", why: "Headers must be a single line." });
  }
  if ([...header.matchAll(/\{\{\d+\}\}/g)].length > 1) {
    f.push({ severity: "blocker", what: "Header has more than one variable", why: "A header may hold at most one." });
  }
  if (footer.length > MAX_FOOTER) {
    f.push({ severity: "blocker", what: `Footer is ${footer.length} characters`, why: `The limit is ${MAX_FOOTER}.` });
  }
  if (/\{\{\d+\}\}/.test(footer)) {
    f.push({ severity: "blocker", what: "Footer has a variable", why: "Footers must be fixed text." });
  }
  for (const b of buttons) {
    if (b.length > MAX_BUTTON) {
      f.push({ severity: "blocker", what: `Button "${b.slice(0, 20)}…" is ${b.length} characters`, why: `The limit is ${MAX_BUTTON}.` });
    }
  }

  // ── the category, which is where the real pain is ───────────────────────────
  const hay = [header, body, footer, buttons.join(" ")].join(" ");
  const marketingHits = found(hay, MARKETING_WORDS);
  const utilityHits = found(hay, UTILITY_WORDS);

  const categoryWhy: string[] = [];
  let likely: Category = t.category;

  if (t.category === "AUTHENTICATION") {
    likely = "AUTHENTICATION";
    categoryWhy.push("Authentication is only for one-time codes. If this is anything else, Meta will move it.");
  } else if (marketingHits.length) {
    likely = "MARKETING";
    categoryWhy.push(`Reads as promotional: ${marketingHits.slice(0, 5).map((w) => `"${w}"`).join(", ")}.`);
    if (t.category === "UTILITY") {
      f.push({
        severity: "risk",
        what: "Submitted as Utility, but it reads as Marketing",
        why: `Meta reclassifies rather than explaining, which is why it comes back again and again. The words doing it: ${marketingHits.slice(0, 5).join(", ")}. Submit it as Marketing and it usually goes straight through.`,
      });
    }
  } else if (utilityHits.length) {
    likely = "UTILITY";
    categoryWhy.push(`Refers to something the person already did: ${utilityHits.slice(0, 4).map((w) => `"${w}"`).join(", ")}.`);
  } else {
    likely = "MARKETING";
    categoryWhy.push("Nothing here points at an existing order, booking or request, so Meta will most likely treat it as Marketing.");
    if (t.category === "UTILITY") {
      f.push({
        severity: "risk",
        what: "Submitted as Utility with nothing transactional in it",
        why: "Utility means a message about something the person already did. Without that, it goes to Marketing.",
      });
    }
  }

  const blockers = f.filter((x) => x.severity === "blocker").length;
  const mismatch = f.some((x) => x.severity === "risk");
  let score: number;
  let scoreWhy: string;
  if (blockers) {
    // A structural rejection is not a probability. It is going to happen.
    score = Math.max(5, 20 - 5 * blockers);
    scoreWhy = `${blockers} thing${blockers === 1 ? "" : "s"} here ${blockers === 1 ? "is" : "are"} rejected automatically, before anyone reads it.`;
  } else if (mismatch) {
    score = 45;
    scoreWhy = `It should go through, but filed as ${likely.toLowerCase()} rather than the category you picked.`;
  } else if (!vars.length) {
    score = 80;
    scoreWhy = "Nothing wrong with it. Without variables you will need a fresh approval for every version of this message.";
  } else {
    score = 90;
    scoreWhy = "Nothing here is a known cause of rejection.";
  }

  return { findings: f, likely, categoryWhy, marketingHits, utilityHits, vars, score, scoreWhy };
}
