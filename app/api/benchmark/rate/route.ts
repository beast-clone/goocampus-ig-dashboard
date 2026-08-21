import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { hasAI, askPerplexityJSON } from "@/lib/ai";
import { recordApiCall } from "@/lib/api-usage";
import { safeError } from "@/lib/errors";

// AI source-rating for the in-dashboard reader ("Approach B" — rate ON OPEN, not for
// every result in the list). Given a page the user actually opened, we read its real
// text (via the existing /api/radar/article reader) and ask Perplexity how useful it
// is as a RESEARCH SOURCE for GooCampus, then CACHE the verdict per-URL in
// discover_cache so we never pay twice for the same link.
//
//   GET /api/benchmark/rate?url=<page>&title=<optional>
//   -> { ai:true, level, label, why, relevance, cached } | { ai:false, reason }
export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — page content is fairly stable
const LABELS: Record<string, string> = { high: "Really important", medium: "Important", low: "Not important" };

type AiVerdict = { level: "high" | "medium" | "low"; reason?: string; relevance?: number };
type Rated = { ai: true; level: "high" | "medium" | "low"; label: string; why: string; relevance: number };

export async function GET(req: Request) {
  const __denied = await requireSection("ads");
  if (__denied) return __denied;

  try {
    const u = new URL(req.url);
    const target = u.searchParams.get("url") || "";
    const title = u.searchParams.get("title") || "";
    if (!target) return NextResponse.json({ ai: false, reason: "no url" }, { status: 400 });

    const db = getSupabase();
    const ck = `srcrate:${target}`;

    // 1) Cache hit → return instantly, no AI spend.
    if (db) {
      const { data } = await db.from("discover_cache").select("payload,last_fetched").eq("cache_key", ck).maybeSingle();
      const age = data?.last_fetched ? Date.now() - new Date(data.last_fetched).getTime() : Infinity;
      if (data?.payload && age < CACHE_TTL_MS) return NextResponse.json({ ...(data.payload as Rated), cached: true });
    }

    // 2) No AI configured / credit exhausted → tell the client to keep its rule-based rating.
    if (!hasAI()) return NextResponse.json({ ai: false, reason: "ai_unavailable" });

    // 3) Read the page's real text through the existing reader (reuses SSRF guard +
    //    Readability + PDF detection). Forward the caller's session cookie so the
    //    protected route accepts the server-to-server call.
    const origin = u.origin;
    let pageText = title;
    let isPdf = false;
    try {
      const art = await fetch(`${origin}/api/radar/article?url=${encodeURIComponent(target)}`, {
        headers: { cookie: req.headers.get("cookie") || "" },
        cache: "no-store",
      });
      if (art.ok) {
        const d = (await art.json()) as { html?: string; title?: string; isPdf?: boolean };
        isPdf = Boolean(d.isPdf);
        const text = (d.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        pageText = `${d.title || title}\n\n${text}`.trim();
      }
    } catch { /* fall back to title-only rating below */ }

    // PDFs / empty extractions: judge from the title alone (still useful — an official
    // "WEB NOTICE — NEET-PG 2026" reads as authoritative even without body text).
    const material = pageText.length > 40 ? pageText.slice(0, 4000) : title;
    if (!material) return NextResponse.json({ ai: false, reason: "no_content" });

    // 4) Ask Perplexity to rate it as a research source for GooCampus.
    let verdict: AiVerdict | null = null;
    try {
      verdict = await askPerplexityJSON<AiVerdict>(
        "You rate how useful a web page is as a RESEARCH SOURCE for GooCampus, which guides Indian students on NEET, MBBS/PG abroad, and medical licensing (PLAB, USMLE, AMC, DHA). "
        + "Judge on TWO grounds: (a) authority — official exam board / regulator / government is highest, a neutral third-party news/info site is medium, a competitor's own promo page or a login / expired / empty page is lowest; "
        + "(b) whether the page actually contains substantive, current, relevant information (dates, eligibility, syllabus, fees, official notices) versus nothing worth taking. "
        + "Return level 'high' only for authoritative AND substantive pages; 'low' for competitor/promo or dead/login/expired pages; else 'medium'. "
        + "reason must be under 12 words. relevance is 0-100 (how relevant + useful to GooCampus).",
        `URL: ${target}${isPdf ? " (PDF)" : ""}\n\nPAGE:\n${material}`,
        { model: "sonar", maxTokens: 150, temperature: 0.1, timeoutMs: 20_000 },
      );
      recordApiCall("Perplexity", true, 200);
    } catch (e) {
      recordApiCall("Perplexity", false, 0);
      return NextResponse.json({ ai: false, reason: "ai_error", detail: (e as Error).message?.slice(0, 120) });
    }

    if (!verdict || !["high", "medium", "low"].includes(verdict.level)) {
      return NextResponse.json({ ai: false, reason: "unparsed" });
    }

    const result: Rated = {
      ai: true,
      level: verdict.level,
      label: LABELS[verdict.level],
      why: (verdict.reason || "").trim() || "Rated by reading the page.",
      relevance: Math.max(0, Math.min(100, Math.round(Number(verdict.relevance) || 0))),
    };

    // 5) Cache the verdict per-URL so repeats (official sources recur constantly) are free.
    if (db) {
      await db.from("discover_cache").upsert(
        { cache_key: ck, source: "source_rating", last_fetched: new Date().toISOString(), payload: result },
        { onConflict: "cache_key" },
      );
    }
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "rating failed"), { status: 502 });
  }
}
