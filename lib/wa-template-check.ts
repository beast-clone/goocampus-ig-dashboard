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

// What actually makes Meta call something Marketing is promotional PRESSURE — being
// asked to do something, or being told to hurry — not the subject matter.
//
// The first version of this listed "counselling session", "webinar" and "demo class",
// which is what GooCampus sells. Those nouns appear in every message the business
// sends, confirmations included, so every template scored as Marketing and the tool
// was useless (Maheen, 2 Oct). A product noun is not a signal. A call to action is.

// Being asked to do something.
const CTA = [
  "apply now", "apply today", "register now", "register here", "register using",
  "register today", "book now", "book your", "join now", "enrol now", "enroll now",
  "sign up", "reserve your", "claim your", "order now", "buy now", "shop now",
  "click here to", "tap here to", "don't wait", "dont wait",
];

// Being told to hurry.
const SCARCITY = [
  "limited seats", "seats are limited", "slots are limited", "limited slots",
  "limited time", "last chance", "hurry", "filling fast", "few seats", "few slots",
  "don't miss", "dont miss", "closing soon", "ends today", "ends tomorrow",
];

// Being sold to.
const PROMO = [
  "offer", "discount", "sale", "deal", "cashback", "coupon", "promo", "exclusive",
  "special price", "best price", "bonus", "upgrade", "introducing", "announcing",
  "new batch", "admission open", "admissions open", "free consultation",
];

// Something the person already did. These are what Utility actually means, and when
// one of them is present with no pressure anywhere, the message IS transactional
// however much business vocabulary it happens to contain.
const CONFIRMS = [
  "is confirmed", "has been confirmed", "now confirmed", "confirmation of",
  "your slot", "your booking", "your appointment", "your seat", "your order",
  "your payment", "your application", "your registration", "your request",
  "your enquiry", "your ticket", "your invoice", "your receipt",
  "has been received", "we have received", "we've received",
  "reference number", "rescheduled", "cancelled", "refund", "status update",
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
  const cta = found(hay, CTA);
  const scarcity = found(hay, SCARCITY);
  const promo = found(hay, PROMO);
  const confirms = found(hay, CONFIRMS);
  const marketingHits = [...cta, ...scarcity, ...promo];
  const utilityHits = confirms;

  const categoryWhy: string[] = [];
  let likely: Category;

  if (t.category === "AUTHENTICATION") {
    likely = "AUTHENTICATION";
    categoryWhy.push("Authentication is only for one-time codes. If this is anything else, Meta will move it.");
  } else if (marketingHits.length) {
    // Pressure beats everything. A confirmation that also sells is still selling.
    likely = "MARKETING";
    const kind = cta.length ? "asks the reader to do something" : scarcity.length ? "tells the reader to hurry" : "promotes something";
    categoryWhy.push(`It ${kind}: ${marketingHits.slice(0, 4).map((w) => `"${w}"`).join(", ")}.`);
    if (t.category === "UTILITY") {
      f.push({
        severity: "risk",
        what: "Submitted as Utility, but it reads as Marketing",
        why: `Meta reclassifies rather than explaining, which is why it comes back again and again. What is doing it: ${marketingHits.slice(0, 4).join(", ")}. Take those out, or submit it as Marketing.`,
      });
    }
  } else if (confirms.length) {
    // No pressure anywhere, and it refers to something already done. That is Utility,
    // whatever the business happens to be called.
    likely = "UTILITY";
    categoryWhy.push(`It confirms something the person already did: ${confirms.slice(0, 3).map((w) => `"${w}"`).join(", ")}. Nothing here asks them to do anything.`);
    if (t.category === "MARKETING") {
      f.push({
        severity: "note",
        what: "This would qualify as Utility",
        why: "Utility templates are cheaper to send and are not blocked by marketing opt-outs. Worth submitting it as Utility instead.",
      });
    }
  } else {
    likely = "MARKETING";
    categoryWhy.push("Nothing here points at an order, booking or request the person already made, so Meta will most likely treat it as Marketing.");
    if (t.category === "UTILITY") {
      f.push({
        severity: "risk",
        what: "Submitted as Utility with nothing transactional in it",
        why: "Utility means a message about something the person already did — a booking, a payment, an application. Without that it goes to Marketing.",
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
  } else {
    score = 90;
    scoreWhy = vars.length
      ? "Nothing here is a known cause of rejection."
      : "Nothing here is a known cause of rejection. Adding {{1}} for the parts that change would save approving this again for every version.";
  }

  return { findings: f, likely, categoryWhy, marketingHits, utilityHits, vars, score, scoreWhy };
}
