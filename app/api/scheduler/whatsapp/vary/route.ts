import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { askClaudeViaPerplexity, parseLooseJson, hasAI } from "@/lib/ai";

// POST /api/scheduler/whatsapp/vary
//
// The same text sent to forty people, word for word, is the single clearest
// signal of a bulk sender — it is what WhatsApp's spam detection is built to
// spot, and what a recipient forwards when they report it. So before a batch
// goes out, each recipient's copy is re-worded.
//
// The rules the model is held to matter more than the writing: every fact,
// link, date, number and price must survive untouched. Only the wording moves.
// If the model returns fewer lines than there are people, the rest keep the
// original — a missing variant must never mean a missing message.
//
// { body, recipients: [{ id, name }] } -> { bodies: { <id>: text } }

export const dynamic = "force-dynamic";

type Recipient = { id: string; name?: string };
type Reply = { variants?: { id?: string; text?: string }[] };

const SYSTEM = `You rewrite one WhatsApp message into several versions, one per recipient, for an Indian education consultancy (GooCampus).

Absolute rules:
- Keep EVERY fact identical: links, phone numbers, dates, times, prices, names of courses, exams and places. Copy them character for character. Never invent a fact that is not in the original.
- Keep the same language and register as the original, including Hinglish or Malayalam if that is what it uses.
- Keep it the same length, give or take a line. WhatsApp, not email.
- Keep any *bold*, _italic_ or emoji style the original uses.
- Actually rewrite. Adding a name to the front of the same sentence is NOT a version — change the opening, reorder the clauses, choose different verbs. No two versions may share their first six words.
- If a recipient has a name, greet them by it once, naturally. If not, do not invent one and do not write "Hi there".
- No sign-off you were not given, no added call to action.

Reply as {"variants":[{"id":"<the id given>","text":"<the message>"}]} — one entry per recipient, ids copied exactly.`;

export async function POST(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const b = (await req.json()) as { body?: string; recipients?: Recipient[] };
    const text = (b.body || "").trim();
    const people = (b.recipients || []).filter((r) => r && r.id).slice(0, 60);
    if (!text || !people.length) {
      return NextResponse.json({ error: "A message and at least one recipient are needed" }, { status: 400 });
    }
    if (!hasAI()) {
      return NextResponse.json({ error: "Perplexity isn't configured, so the wording can't be varied" }, { status: 503 });
    }

    // Eight at a time, all in flight together. Forty in one call would take a
    // minute, and a hosted function is cut off long before that; eight come back
    // in about the same time as four. A chunk that fails only loses its own
    // eight, which then send the original.
    const chunks: Recipient[][] = [];
    for (let i = 0; i < people.length; i += 8) chunks.push(people.slice(i, i + 8));

    // Sonar will not do this job: asked to rewrite, it puts the recipient's name
    // in front of the original sentence and calls that a version. Claude runs on
    // the same Perplexity key and actually rewrites, which is worth the extra
    // cost on a batch someone deliberately ticked.
    const replies = await Promise.all(chunks.map(async (chunk) => {
      const roster = chunk
        .map((r) => `- id: ${r.id}${r.name ? ` · name: ${r.name}` : " · no name known"}`)
        .join("\n");
      try {
        const { text: reply } = await askClaudeViaPerplexity(
          `${SYSTEM}\n\nIMPORTANT: reply with ONLY valid JSON — no markdown, no code fences, no prose before or after.`,
          `Original message:\n"""\n${text}\n"""\n\nWrite one version for each of these ${chunk.length} recipients:\n${roster}`,
          { feature: "whatsapp-vary", temperature: 1, maxTokens: 260 * chunk.length + 600, timeoutMs: 60_000 },
        );
        return parseLooseJson<Reply>(reply);
      } catch { return null; }
    }));

    // Whatever comes back, every recipient ends up with something to send.
    const bodies: Record<string, string> = {};
    for (const out of replies) {
      for (const v of out?.variants || []) {
        const id = (v.id || "").trim();
        const t = (v.text || "").trim();
        if (id && t && people.some((p) => p.id === id)) bodies[id] = t;
      }
    }
    const varied = Object.keys(bodies).length;
    // Nothing came back at all: say so rather than quietly queueing the same
    // text everyone asked not to send.
    if (!varied) {
      return NextResponse.json({ error: "The model didn't return any versions" }, { status: 502 });
    }
    for (const p of people) if (!bodies[p.id]) bodies[p.id] = text;

    return NextResponse.json({ bodies, varied, total: people.length });
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 });
  }
}
