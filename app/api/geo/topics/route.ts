import { NextResponse } from "next/server";
import { geoGuard, geoDb, bad } from "../_shared";
import { guardRate } from "@/lib/api-guard";
import { findQuestions, monthSpend, monthlyLimit, type Brand } from "@/lib/geo";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// POST /api/geo/topics { brandId, topic } → real Google India questions and searches
// for the topic (about $0.002), to pick from. Nothing is tracked until they're added.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await geoGuard();
  if (denied) return denied;
  const limited = guardRate(req, "geo-topics", 30, 600_000);
  if (limited) return limited;
  const b = await req.json().catch(() => ({}));
  const topic = String(b.topic || "").trim().slice(0, 100);
  if (topic.length < 3) return bad("Type a topic (a few words).");
  try {
    const db = geoDb();
    const { data: brand } = await db.from("geo_brands").select("id, name, domain, aliases").eq("id", String(b.brandId || "")).maybeSingle();
    if (!brand) return bad("Pick a brand first.");
    if ((await monthSpend()) >= (await monthlyLimit())) return bad("This month's GEO SEO limit is used up.");
    return NextResponse.json(await findQuestions(topic, brand as Brand, getSessionUserId()));
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't find questions for that topic"), { status: 502 });
  }
}
