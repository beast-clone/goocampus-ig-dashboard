// Leads Overview — view-only analytics endpoint.
// Aggregates ad leads (Meta Marketing API) + comment-funnel leads (IG comments)
// and reply rate for a given account + date range.

import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
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
  // .limit(1)+[0], not .maybeSingle() — maybeSingle() returns null for a single
  // row with a large jsonb payload, silently defeating this cache.
  const { data } = await db.from("discover_cache").select("payload,last_fetched").eq("cache_key", key).limit(1);
  const row = data?.[0];
  if (!row) return null;
  return { payload: row.payload, ageMs: Date.now() - new Date(row.last_fetched as string).getTime() };
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
  const __denied = await requireSection("sales");
  if (__denied) return __denied;

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
    // ---------- Run ad fetch + media/comments in parallel ----------
    const adAcct = await getAdAccount();

    type AdData = { adLeads: number; adSpend: number; monthlyAdLeads: Record<string, number> };
    type PostLead = { id: string; permalink: string; caption: string; leads: number };
    type CommentData = {
      commentLeads: number; totalComments: number; totalReplied: number;
      monthlyCommentLeads: Record<string, number>; keywordCounts: Record<string, number>;
      postsAnalyzed: number; topPostsRaw: PostLead[];
    };

    const adsPromise: Promise<AdData> = (async () => {
      const out: AdData = { adLeads: 0, adSpend: 0, monthlyAdLeads: {} };
      if (!adAcct || !from || !to) return out;
      try {
        const daily = await fetchAdsDaily(adAcct, from, to);
        for (const d of daily) {
          out.adLeads += d.leads || 0;
          out.adSpend += d.spend || 0;
          const m = monthOf(d.date);
          if (m) out.monthlyAdLeads[m] = (out.monthlyAdLeads[m] || 0) + (d.leads || 0);
        }
      } catch { /* ignore */ }
      return out;
    })();

    const commentsPromise: Promise<CommentData> = (async () => {
      const out: CommentData = {
        commentLeads: 0, totalComments: 0, totalReplied: 0,
        monthlyCommentLeads: {}, keywordCounts: {}, postsAnalyzed: 0, topPostsRaw: [],
      };
      const media = await fetchRecentMedia(acct, 50);
      const inRange = media.filter((m) => {
        if (!from && !to) return true;
        const t = m.timestamp;
        return (!from || t >= from) && (!to || t <= to + "T23:59:59Z");
      });
      out.postsAnalyzed = inRange.length;

      // Higher concurrency = much faster (Meta tolerates well)
      const concurrency = 12;
      let idx = 0;
      async function worker() {
        while (idx < inRange.length) {
          const i = idx++;
          const m = inRange[i];
          if ((m.comments_count ?? 0) === 0) continue;
          try {
            const comments = await fetchMediaComments(acct!, m.id, 50);
            let postLeads = 0;
            for (const c of comments) {
              out.totalComments++;
              const det = detectLead(c.text || "");
              if (det.lead && det.keyword) {
                out.commentLeads++;
                postLeads++;
                out.keywordCounts[det.keyword] = (out.keywordCounts[det.keyword] || 0) + 1;
                const mo = monthOf(c.timestamp);
                if (mo) out.monthlyCommentLeads[mo] = (out.monthlyCommentLeads[mo] || 0) + 1;
              }
              const repls = (c.replies as { data?: { id: string }[] } | undefined)?.data;
              if (repls && repls.length > 0) out.totalReplied++;
            }
            if (postLeads > 0) {
              out.topPostsRaw.push({
                id: m.id,
                permalink: m.permalink,
                caption: (m.caption || "").replace(/\s+/g, " ").trim().slice(0, 90),
                leads: postLeads,
              });
            }
          } catch { /* skip */ }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, inRange.length) }, () => worker()));
      return out;
    })();

    const [ads, comments] = await Promise.all([adsPromise, commentsPromise]);
    const { adLeads, adSpend, monthlyAdLeads } = ads;
    const { commentLeads, totalComments, totalReplied, monthlyCommentLeads, keywordCounts } = comments;

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
      postsAnalyzed: comments.postsAnalyzed,
      leadsPerPost: comments.postsAnalyzed > 0 ? commentLeads / comments.postsAnalyzed : 0,
      commentConversion: totalComments > 0 ? commentLeads / totalComments : 0,
      topPosts: comments.topPostsRaw.sort((a, b) => b.leads - a.leads).slice(0, 3),
    };

    await cacheSet(cacheKey, result);
    return NextResponse.json({ ...result, cached: false, latencyMs: Date.now() - t0 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
