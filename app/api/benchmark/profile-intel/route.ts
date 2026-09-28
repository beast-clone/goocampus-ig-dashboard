import { NextResponse } from "next/server";
import { guardRate, requireSection } from "@/lib/api-guard";
import { cachedShared } from "@/lib/api-cache";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { recordApiCall, callsThisMonth } from "@/lib/api-usage";
import { getReviews } from "@/lib/google-reviews";
import { safeError } from "@/lib/errors";

// What the web says about ONE competitor — web mentions grouped by where they are,
// plus their Google Maps rating and reviews.
//
//   GET /api/benchmark/profile-intel?name=Hello Mentor[&force=1]
//
// Budget is the whole design here. Serper is capped at 200 calls a month
// (SERPER_MONTHLY_BUDGET), and a profile page gets opened over and over, so:
//   · one search per competitor, not one per source — results are grouped by host
//     afterwards, which is free, instead of four site: queries which are not;
//   · cached for a day in Supabase, so re-opening a profile costs nothing;
//   · only ever fetched for the profile actually on screen, never for all of them;
//   · when the monthly cap is reached it returns capped:true and the page says so
//     rather than silently showing an empty panel.
export const dynamic = "force-dynamic";

const BUDGET = Number(process.env.SERPER_MONTHLY_BUDGET) || 200;
const TTL_MS = 24 * 60 * 60 * 1000;

const POS = /\b(best|top|great|excellent|success|trusted|recommend|helped?|amazing|award|leading|genuine|reliable)\b/i;
const NEG = /\b(scam|fraud|fake|worst|avoid|complaint|refund|cheat|poor|warning|lawsuit|misuse|theft|waste|disappoint)\b/i;
const sentimentOf = (t: string) => (NEG.test(t) ? "negative" : POS.test(t) ? "positive" : "neutral") as "positive" | "negative" | "neutral";
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

// The places worth calling out by name; everything else groups under "Web".
const LANES: { key: string; label: string; match: RegExp }[] = [
  { key: "reddit", label: "Reddit", match: /(^|\.)reddit\.com$/ },
  { key: "quora", label: "Quora", match: /(^|\.)quora\.com$/ },
  { key: "mouthshut", label: "MouthShut", match: /(^|\.)mouthshut\.com$/ },
  { key: "valuemd", label: "ValueMD", match: /(^|\.)valuemd\.com$/ },
  { key: "youtube", label: "YouTube", match: /(^|\.)youtube\.com$/ },
];
const laneFor = (h: string) => LANES.find((l) => l.match.test(h))?.key || "web";

type Mention = { title: string; url: string; snippet: string; source: string; lane: string; publishedAt: string; sentiment: string };

export async function GET(req: Request) {
  const denied = await requireSection("analytics");
  if (denied) return denied;
  const limited = guardRate(req, "profile-intel", 20, 300_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const name = (url.searchParams.get("name") || "").trim();
  const force = url.searchParams.get("force") === "1";
  // A plain search for a company returns its own site and directories — useful for
  // presence, useless for "what are people saying". Forum results need a query that
  // asks for them, which is a second Serper call, so it is opt-in per competitor
  // rather than something every profile view pays for.
  const forums = url.searchParams.get("forums") === "1";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const key = process.env.SERPER_API_KEY;
  if (!key) return NextResponse.json({ configured: false, mentions: [], lanes: [], reviews: null });

  try {
    // Cached first — a cache hit spends nothing, so the cap check only guards a
    // real fetch. Checking it earlier would hide data we already hold.
    const { data: mentions } = await cachedShared<Mention[]>(
      `compintel:${forums ? "forums:" : ""}${name.toLowerCase()}`,
      TTL_MS,
      async () => {
        if (callsThisMonth("Serper") >= BUDGET) throw new Error("CAPPED");
        const r = await fetchWithTimeout("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            q: forums
              ? `"${name}" (site:reddit.com OR site:quora.com OR site:mouthshut.com OR site:valuemd.com)`
              : `"${name}"`,
            gl: "in", num: 10,
          }),
          timeoutMs: 12_000, cache: "no-store",
        });
        recordApiCall("Serper", r.ok, r.status);
        if (!r.ok) return [];
        const j = (await r.json()) as { organic?: { title?: string; link?: string; snippet?: string; date?: string }[] };
        return (j.organic || []).filter((o) => o.link && o.title).map((o) => {
          const h = host(o.link!);
          return {
            title: o.title!, url: o.link!, snippet: o.snippet || "",
            source: h, lane: laneFor(h), publishedAt: o.date || "",
            sentiment: sentimentOf(`${o.title} ${o.snippet || ""}`),
          };
        });
      },
      { force },
    ).catch((e) => {
      if ((e as Error).message === "CAPPED") return { data: null as Mention[] | null };
      throw e;
    }) as { data: Mention[] | null };

    if (mentions === null) return NextResponse.json({ capped: true, mentions: [], lanes: [], reviews: null });

    // Their Google Maps listing. getReviews caches on its own, so this is usually free.
    const reviews = await getReviews(force, name).catch(() => null);

    const lanes = [...LANES, { key: "web", label: "Web", match: /.*/ }]
      .map((l) => ({ key: l.key, label: l.label, count: mentions.filter((m) => m.lane === l.key).length }))
      .filter((l) => l.count > 0);

    return NextResponse.json({
      configured: true,
      mentions,
      lanes,
      reviews: reviews?.place
        ? { title: reviews.place.title, rating: reviews.place.rating, ratingCount: reviews.place.ratingCount, items: (reviews.reviews || []).slice(0, 5) }
        : null,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't read what the web says"), { status: 502 });
  }
}
