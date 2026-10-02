import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { hasAI, askPerplexity } from "@/lib/ai";
import { checkTemplate, type TemplateDraft } from "@/lib/wa-template-check";
import { safeError } from "@/lib/errors";

// POST /api/broadcast/template-check  { name, category, header, body, footer, buttons, rewrite? }
//
// The rules run first and always — a variable at the start of the body is a fact, not a
// judgement, and leaving facts to a model to notice is how they get missed. The AI pass
// only runs when asked, and only adds the two things rules cannot do: a second opinion
// on the category, and a rewritten version.
//
// Nothing here is Meta's verdict. There is no endpoint that previews one.
export const dynamic = "force-dynamic";

const SYSTEM = `You review WhatsApp Business message templates before they are submitted to Meta, for an Indian medical-education company (NEET counselling, MBBS/PG abroad, licensing exams).

You are not Meta and you cannot approve anything. Your job is to say what will most likely get this rejected or silently reclassified, and to hand back a version that will not.

What matters:
- UTILITY is only for a message about something the person ALREADY did — an order, a payment, a booking, an application they submitted. Everything else is MARKETING, including anything that invites, promotes, reminds them to buy, or re-engages a lead.
- Meta does not explain a reclassification. It just moves the category, which reads as an unexplained rejection. Say plainly which category this will land in.
- Variables are {{1}}, {{2}} and so on. They may not open or close the body, may not sit next to each other, and must run in order. Your rewrite MUST obey this too — do not end on a variable, which is the easiest one to get wrong. Put a word or a full stop after the last one.

Answer as JSON only:
{"category":"UTILITY|MARKETING|AUTHENTICATION","verdict":"one sentence on whether this goes through as submitted","problems":["short, specific"],"rewrite":"the full corrected body text, variables intact"}

The rewrite must keep the sender's meaning and read like a person wrote it. No preamble.`;

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  const limited = guardRate(req, "wa-template-check", 20, 300_000);
  if (limited) return limited;

  let b: TemplateDraft & { rewrite?: boolean };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!b?.body?.trim()) return NextResponse.json({ error: "Paste the template body first." }, { status: 400 });

  const rules = checkTemplate({
    name: b.name || "", category: b.category || "MARKETING",
    header: b.header, body: b.body, footer: b.footer, buttons: b.buttons,
  });

  // The rules alone are the useful half, so they come back even when AI is off or fails.
  if (!b.rewrite || !hasAI()) return NextResponse.json({ ...rules, ai: null });

  try {
    const user = [
      `Submitting as: ${b.category}`,
      b.header ? `Header: ${b.header}` : "",
      `Body:\n${b.body}`,
      b.footer ? `Footer: ${b.footer}` : "",
      b.buttons?.length ? `Buttons: ${b.buttons.join(" | ")}` : "",
    ].filter(Boolean).join("\n\n");

    const { text } = await askPerplexity(SYSTEM, user, { maxTokens: 900, feature: "wa-template-check" });
    // The model is asked for JSON and usually obliges; when it does not, the rules still
    // stand on their own rather than the whole call being wasted.
    let ai: unknown = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) ai = JSON.parse(m[0]);
    } catch { /* fall through — rules only */ }
    // The rewrite gets the same rules as the draft. Asked not to end on a variable,
    // the model did exactly that on the first real template put through here — so the
    // instruction is not trusted, it is verified.
    const rw = (ai as { rewrite?: string } | null)?.rewrite;
    const rewriteFindings = rw
      ? checkTemplate({ name: b.name || "x", category: b.category, body: rw }).findings
          .filter((x) => x.severity === "blocker")
      : [];
    return NextResponse.json({ ...rules, ai, rewriteFindings, aiRaw: ai ? null : text.slice(0, 800) });
  } catch (err) {
    return NextResponse.json({ ...rules, ai: null, aiError: safeError(err, "The second opinion didn't come back").error });
  }
}
