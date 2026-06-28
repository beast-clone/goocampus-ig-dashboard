// Leads Overview — view-only analytics endpoint.
// Aggregates ad leads (Meta Marketing API) + comment-funnel leads (IG comments)
// and reply rate for a given account + date range.

import { NextResponse } from "next/server";
import { getAccount, fetchRecentMedia, fetchMediaComments } from "@/lib/instagram";
import { getAdAccount, fetchAdsDaily } from "@/lib/meta-ads";
import { getSupabase } from "@/lib/supabase";

// Funnel keywords that mark a comment as a lead (short-comment match).
const FUNNEL_KEYWORDS = [
  "amc", "global", "handbook", "blueprint", "blue print", "guide", "uae", "als",
  "match", "info", "plab", "usmle", "neetpg", "neet", "fmge", "ukmla", "ielts", "oet",
];
const CTA_MARKERS = [
  "comment ", "dm us", "dm me for", "join our", "join the", "link in bio", "book your",
  "book a", "call us", "visit ", "follow ", "save this", "take the free", "to register",
  "to know more", "to get your", "secure your copy",
];
const INTENT_RE = /\b(interested|want to (join|know|apply|register)|how (do|can) i|sign me up|register me|my number|whatsapp me|dm me)\b|\+?\d{10}|[\w.]+@[\w.]+/i;

const OVERVIEW_TTL_MS = 30 * 60 * 1000; // 30 min cache

type LeadHit = { keyword: string; month: string };

function detectLead(text: string): { lead: boolean; keyword?: string } {
  const t = (text || "").trim().toLowerCase();
  if (!t) return { lead: false };
  if (CTA_MARKERS.some((m) => t.includes(m))) return { lead: false };
  const words = t.split(/\s+/);
  if (words.length <= 3) {
    const k = FUNNEL_KEYWORDS.find((kw) => t.includes(kw));
    if (k) return { lead: true, keyword: k };
  }
  if (INTENT_RE.test(t)) return { lead: true, keyword: "intent" };
  return { lead: false };
}

function monthOf(iso: string): string {
  return (iso || "").slice(0, 7);
}

async function cacheGet(key: string) {
  const db = getSupabase();
  if (!db) return null;
  const { data } = await db.from("discover_cache").select("payload,last_fetched").eq("cache_key", key).maybeSingle();
  if (!data) return null;
  return { payload: data.payload, ageMs: Date.now() - new Date(data.last_fetched as string).getTime() };
}
async function cacheSet(key: string, payload: unknown) {
  const db = getSupabase();
  if (!db) return;
  await db.from("discover_cache").upsert(
    { cache_key: key, source: "leads_overview", last_fetched: new Date().toISOString(), payload },
    { onConflict: "cache_key" },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId") || "goocampus";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const force = url.searchParams.get("force") === "1";

  const acct = getAccount(accountId);
  if (!acct) return NextResponse.json({ error: `Unknown account ${accountId}` }, { status: 404 });

  const t0 = Date.now();
  const cacheKey = `leads_overview:${accountId}:${from}:${to}`;

  if (!force) {
    const cached = await cacheGet(cacheKey);
    if (cached && cached.ageMs < OVERVIEW_TTL_MS) {
      const p = cached.payload as Record<string, unknown>;
      return NextResponse.json({ ...p, cached: true, cacheAgeMs: cached.ageMs, latencyMs: Date.now() - t0 });
    }
  }

  try {
    // ---------- Ad leads (per-day breakdown from Meta Ads) ----------
    const adAcct = getAdAccount();
    let adLeads = 0;
    let adSpend = 0;
    const monthlyAdLeads: Record<string, number> = {};
    if (adAcct && from && to) {
      try {
        const daily = await fetchAdsDaily(adAcct, from, to);
        for (const d of daily) {
          adLeads += d.leads || 0;
          adSpend += d.spend || 0;
          const m = monthOf(d.date);
          if (m) monthlyAdLeads[m] = (monthlyAdLeads[m] || 0) + (d.leads || 0);
        }
      } catch { /* ignore — ad pull failures shouldn't kill the page */ }
    }

    // ---------- Comment-funnel leads + reply rate (sampling: last 50 posts) ----------
    const media = await fetchRecentMedia(acct, 50);
    const inRange = media.filter((m) => {
      if (!from && !to) return true;
      const t = m.timestamp;
      return (!from || t >= from) && (!to || t <= to + "T23:59:59Z");
    });

    let commentLeads = 0;
    let totalComments = 0;
    let totalReplied = 0;
    const monthlyCommentLeads: Record<string, number> = {};
    const keywordCounts: Record<string, number> = {};

    // Pull comments in parallel, cap concurrency
    const concurrency = 6;
    let idx = 0;
    async function worker() {
      while (idx < inRange.length) {
        const i = idx++;
        const m = inRange[i];
        if ((m.comments_count ?? 0) === 0) continue;
        try {
          const comments = await fetchMediaComments(acct!, m.id, 50);
          for (const c of comments) {
            totalComments++;
            const det = detectLead(c.text || "");
            if (det.lead && det.keyword) {
              commentLeads++;
              keywordCounts[det.keyword] = (keywordCounts[det.keyword] || 0) + 1;
              const mo = monthOf(c.timestamp);
              if (mo) monthlyCommentLeads[mo] = (monthlyCommentLeads[mo] || 0) + 1;
            }
            const repls = (c.replies as { data?: { id: string }[] } | undefined)?.data;
            if (repls && repls.length > 0) totalReplied++;
          }
        } catch { /* skip */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, inRange.length) }, () => worker()));

    // ---------- Merge monthly ----------
    const allMonths = Array.from(new Set([
      ...Object.keys(monthlyAdLeads),
      ...Object.keys(monthlyCommentLeads),
    ])).sort();
    const byMonth = allMonths.map((m) => ({
      month: m,
      ads: monthlyAdLeads[m] || 0,
      comments: monthlyCommentLeads[m] || 0,
      total: (monthlyAdLeads[m] || 0) + (monthlyCommentLeads[m] || 0),
    }));

    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, leads]) => ({ keyword, leads }));

    const result = {
      account: { id: acct.id, handle: acct.handle },
      range: { from, to },
      totals: {
        all: adLeads + commentLeads,
        ads: adLeads,
        comments: commentLeads,
      },
      byMonth,
      topKeywords,
      adSpend,
      costPerLead: adLeads > 0 ? adSpend / adLeads : 0,
      commentReplyRate: totalComments > 0 ? totalReplied / totalComments : 0,
      commentsReplied: totalReplied,
      totalComments,
      postsAnalyzed: inRange.length,
    };

    await cacheSet(cacheKey, result);
    return NextResponse.json({ ...result, cached: false, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
