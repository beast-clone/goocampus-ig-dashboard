import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { keywordResearch } from "@/lib/keyword-research";

// GET /api/seo/research?q=<seed> → Google keyword ideas, questions, top 10 + our rank,
// and our Search Console searches containing the seed (lib/keyword-research.ts).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const limited = guardRate(req, "seo-research", 30, 300_000);
  if (limited) return limited;
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2 || q.length > 80) return NextResponse.json({ error: "Type a keyword (2–80 characters)." }, { status: 400 });
  try {
    return NextResponse.json(await keywordResearch(q));
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't research that keyword"), { status: 502 });
  }
}
