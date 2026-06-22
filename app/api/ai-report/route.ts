import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { mockInsights } from "@/lib/mock";

export async function POST(req: Request) {
  const { accountId, range } = await req.json();
  const data = mockInsights(accountId, range.from, range.to);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({
      report:
        "ANTHROPIC_API_KEY not set — this is a stub.\n\n" +
        `Selected: ${accountId} | ${range.from} → ${range.to}\n` +
        `Totals: followers=${data.totals.followers}, reach=${data.totals.reach}, engagement=${data.totals.engagement}\n\n` +
        "Add your API key in env to enable real AI analysis.",
    });
  }

  const client = new Anthropic({ apiKey: key });
  const sys = `You are an Instagram growth analyst for GooCampus, a medical-education brand. Analyze the data and respond in this exact structure:

WHAT WORKED
- 3 bullets, specific to the numbers

WHAT DROPPED
- 3 bullets, specific to the numbers

WHY (hypotheses)
- 2-3 bullets

NEXT WEEK — 5 ACTIONS
1. ...
2. ...
3. ...
4. ...
5. ...

Be direct. No fluff. No emojis. Cite the actual numbers.`;

  const userMsg = `Account: ${accountId}
Window: ${range.from} → ${range.to}

Totals: ${JSON.stringify(data.totals)}
Deltas (%): ${JSON.stringify(data.deltas)}
Daily series: ${JSON.stringify(data.series)}
Latest post: ${JSON.stringify(data.latestPost)}`;

  try {
    const resp = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1500,
      system: sys,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return NextResponse.json({ report: text });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
