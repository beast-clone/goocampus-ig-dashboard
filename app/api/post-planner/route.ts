import { NextResponse } from "next/server";
import { askPerplexity, hasAI } from "@/lib/ai";
import { getSupabase } from "@/lib/supabase";
import { getTopTimeSuggestions, getTopPerformers } from "@/lib/scheduler-helpers";
import { fetchContentCalendarBody } from "@/lib/content-calendar";
import { safeError } from "@/lib/errors";

// Ranking is web-search-grounded via Perplexity 'sonar' (see lib/ai) — the sonar
// models search the live web, which is exactly what the trend-aware ordering needs.

// Pull a plain-JSON object out of a model reply that may wrap it in prose / code fences.
function parseLooseJson<T>(text: string): T | null {
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { /* fall through */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try { return JSON.parse(candidate) as T; } catch { return null; }
}

// Post Planner — "what should we publish next, and when."
//
// Scoped to @12thplus (the account where badly-spaced posts cannibalised each
// other). 12thplus content lives in the Marketing Hub (Supabase mh_posts),
// tagged with the SBU below. The planner:
//   1. Reads the 12thplus pipeline (posts made / ready, not yet published).
//   2. Asks the AI to ORDER them so no two similar-topic/similar-format posts
//      sit back-to-back (the anti-cannibalisation rule).
//   3. Deterministically lays them onto the calendar with a HARD 24-hour minimum
//      gap, snapped to the audience's best hours.
// Advisory only — it never writes back; the team decides.

const SBU = "India NEET UG Consulting"; // ← 12thplus content is tagged with this SBU in the Marketing Hub
const PAGE = "12Plus / GC India";       // for best-times / top-performers (resolves to @12thplus IG)
const IG_TYPES = ["Reel - Original", "Reel - Cut", "Carousel", "Post"]; // real posts (skip thumbnails, ads, YouTube)
const PUBLISHED_STATUS = "Published/Scheduled";
const MIN_GAP_MS = 24 * 60 * 60 * 1000;
const DEFAULT_HOURS = [9, 13, 19];

type Cached = { at: number; payload: unknown };
let cache: Cached | null = null;
const TTL_MS = 30 * 60 * 1000;

type MhRow = {
  id: string; particulars: string | null; type: string | null; status: string | null;
  sbu: string | null; caption: string | null; content: string | null; priority: string | null;
  publishing_date: string | null; instagram_url: string | null; updated_at: string | null;
  owner_key: string | null; media_urls: string[] | null; planner_note: string | null;
  airtable_record_id: string | null; output_link: string | null;
};

type PlannedPost = {
  id: string; title: string; type: string; interest: string; thumbnailUrl: string | null;
  status: string; owner: string; publishingDate: string | null; suggestedTime: string; reason: string; tags: string[];
  mediaUrls: string[]; caption: string; airtableRecordId: string | null; assetLink: string | null;
};

// A post on the actual Publishing Calendar (tab 2) — the team's real dates, owner and
// workflow status. Anything with a publishing_date shows up here.
type CalendarPost = {
  id: string; title: string; type: string; status: string; owner: string;
  publishingDate: string | null; thumbnailUrl: string | null; instagramUrl: string | null;
  note: string | null; mediaUrls: string[]; caption: string; airtableRecordId: string | null; assetLink: string | null;
};

const snippet = (s: string | null, n = 140) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
// Perplexity adds inline source markers like [2][5] — strip them for clean copy.
const stripCites = (s: string) => (s || "").replace(/\s*\[\d+\](?:\s*\[\d+\])*/g, "").replace(/\s{2,}/g, " ").trim();

function nextSlot(afterMs: number, bestHours: number[]): Date {
  const d = new Date(afterMs);
  d.setMinutes(0, 0, 0);
  if (d.getTime() < afterMs) d.setHours(d.getHours() + 1);
  for (let i = 0; i < 24 * 10; i++) {
    if (bestHours.includes(d.getHours()) && d.getTime() >= afterMs) return new Date(d);
    d.setHours(d.getHours() + 1);
  }
  return new Date(afterMs);
}

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ ...(cache.payload as object), cached: true });
  }

  try {
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const [{ data, error }, times, top] = await Promise.all([
      sb.from("mh_posts")
        .select("id,particulars,type,status,sbu,caption,content,priority,publishing_date,instagram_url,updated_at,owner_key,media_urls,planner_note,airtable_record_id,output_link")
        .eq("sbu", SBU)
        .order("publishing_date", { ascending: true, nullsFirst: false }),
      getTopTimeSuggestions(PAGE, 4).catch(() => []),
      getTopPerformers(PAGE, 6, 90).catch(() => []),
    ]);
    if (error) throw new Error(`mh_posts: ${error.message}`);

    const rows = ((data || []) as MhRow[]).filter((r) => IG_TYPES.includes(r.type || ""));
    const nowMs = Date.now();

    // Tab 2 (Publishing Calendar): every 12thplus post that isn't already published,
    // with its ACTUAL publishing_date + owner + workflow status. The team drags these.
    const calendar: CalendarPost[] = rows
      .filter((r) => r.status !== PUBLISHED_STATUS)
      .map((r) => ({
        id: r.id,
        title: r.particulars || "",
        type: r.type || "",
        status: r.status || "",
        owner: r.owner_key || "",
        publishingDate: r.publishing_date,
        thumbnailUrl: (r.media_urls && r.media_urls[0]) || null,
        instagramUrl: r.instagram_url,
        note: r.planner_note,
        mediaUrls: r.media_urls || [],
        caption: r.caption || "",
        airtableRecordId: r.airtable_record_id,
        assetLink: r.output_link,
      }));

    // Last thing actually out — anchor for the 24h gap + "don't repeat this".
    const published = rows
      .filter((r) => r.status === PUBLISHED_STATUS && r.publishing_date && new Date(r.publishing_date).getTime() <= nowMs)
      .sort((a, b) => (b.publishing_date || "").localeCompare(a.publishing_date || ""));
    const last = published[0] || null;

    // Candidates = pipeline posts not yet published.
    const candidates = rows
      .filter((r) => r.status !== PUBLISHED_STATUS)
      .slice(0, 15);

    const bestHours = times.length ? [...new Set(times.map((t) => t.hour))] : DEFAULT_HOURS;

    if (candidates.length === 0) {
      const payload = {
        page: PAGE, account: "@12thplus", sbu: SBU, minGapHours: 24, bestHours,
        last: last ? { title: last.particulars, type: last.type, interest: SBU, at: last.publishing_date } : null,
        summary: `No 12thplus posts are waiting in the Marketing Hub pipeline right now (SBU "${SBU}"). Add content there and I'll sequence it.`,
        insight: "", plan: [] as PlannedPost[], hold: [] as { id: string; title: string; reason: string }[],
        calendar,
        generatedAt: new Date().toISOString(),
      };
      cache = { at: Date.now(), payload };
      return NextResponse.json({ ...payload, cached: false });
    }

    // ---- Pull each candidate's REAL content (slides / body) from the Content field,
    // so the ranker searches the web for the actual topic, not just the title. ----
    const contentPairs = await Promise.all(candidates.map(async (c) => {
      if (!c.airtable_record_id) return [c.id, ""] as const;
      try { const { content } = await fetchContentCalendarBody(c.airtable_record_id); return [c.id, snippet(content, 180)] as const; }
      catch { return [c.id, ""] as const; }
    }));
    const contentById = new Map(contentPairs);

    // ---- AI: decide the ORDER (web-search-grounded) ----
    const ctx = {
      lastPublished: last ? { title: last.particulars, type: last.type, caption: snippet(last.caption || last.content) } : null,
      whatWorks: top.map((t) => ({ type: t.mediaType, caption: snippet(t.caption, 80), reach: t.reach })),
      candidates: candidates.map((c) => ({
        id: c.id, title: c.particulars || "", type: c.type || "", status: c.status || "",
        priority: c.priority || "",
        content: contentById.get(c.id) || snippet(c.caption || c.content, 120),
      })),
    };

    type AIOrder = { summary?: string; insight?: string; order?: { id: string; reason?: string; tags?: string[] }[]; hold?: { id: string; reason?: string }[] };
    let ai: AIOrder = {};
    let rankedBy = "none";

    const searchSystem = [
      "You schedule Instagram posts for @12thplus — an Indian education account for students after 12th grade (NEET UG, courses/careers after 12th, competitive exams, colleges).",
      "Each CANDIDATE has a title and its ACTUAL content (the carousel slides / body). First, for EACH candidate, derive its real topic from the content (e.g. 'top BSc courses', 'NEET UG cutoff', 'IT courses after 12th') and SEARCH THE WEB to judge how much interest/attention that topic has RIGHT NOW in India — recent news, seasonality (results/admissions/exam dates), rising search interest.",
      "THEN decide the ORDER to publish the candidates. A 24-HOUR minimum gap is enforced separately — focus on order and topic/format spacing, not exact times.",
      "RANK by, in priority: (a) topics that are TRENDING or timely right now go earlier; (b) what has historically performed for this account (whatWorks); (c) 'priority' where set; (d) never place two SAME-topic or SAME-format posts back-to-back (they cannibalise each other's reach); (e) alternate formats for feed variety; (f) if a candidate is too similar to the LAST published post, push it later or move it to hold.",
      "Do ALL your web searching in this one pass, then answer. Keep every reason SHORT — one plain clause, max ~14 words — citing the trend when relevant (e.g. 'trending: BSc searches spike after board results'). No source markers like [1].",
      "Return ONLY a JSON object, no prose around it: { summary: string (1 short sentence), insight: string (1 short sentence on what's timely right now), order: [{ id, reason (short), tags: string[] }] (every candidate id, in publish order), hold: [{ id, reason }] (optional) }.",
      "tags are short labels like: 'trending now', 'timely', 'proven format', 'different topic', 'format variety', 'complements last post', 'fresh angle', 'priority'.",
    ].join("\n");

    if (hasAI()) {
      // Web-search-grounded ranker via Perplexity 'sonar'. Bounded so the tab never
      // spins forever — on timeout/failure we fall through to the deterministic order.
      try {
        const { text } = await askPerplexity(searchSystem, JSON.stringify(ctx), { maxTokens: 1200, timeoutMs: 38_000 });
        ai = parseLooseJson<AIOrder>(text) || {};
        if (ai.order && ai.order.length) rankedBy = "perplexity:sonar";
      } catch (e) { console.error("[planner] perplexity rank failed, falling back to deterministic:", (e as Error).message); ai = {}; }
    }

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const holdIds = new Set((ai.hold || []).map((h) => h.id));
    const ordered: { post: MhRow; reason: string; tags: string[] }[] = [];
    for (const o of ai.order || []) {
      const post = byId.get(o.id);
      if (post && !holdIds.has(o.id)) { ordered.push({ post, reason: stripCites(o.reason || ""), tags: o.tags || [] }); byId.delete(o.id); }
    }
    for (const c of candidates) if (byId.has(c.id) && !holdIds.has(c.id)) ordered.push({ post: c, reason: "", tags: [] });

    // ---- Deterministic time assignment: hard 24h gap, snapped to best hours ----
    const lastMs = last?.publishing_date ? new Date(last.publishing_date).getTime() : 0;
    let cursor = Math.max(nowMs + 2 * 60 * 60 * 1000, lastMs ? lastMs + MIN_GAP_MS : 0);
    const plan: PlannedPost[] = ordered.map(({ post, reason, tags }) => {
      const slot = nextSlot(cursor, bestHours);
      cursor = slot.getTime() + MIN_GAP_MS;
      return {
        id: post.id, title: post.particulars || "", type: post.type || "", interest: SBU,
        thumbnailUrl: (post.media_urls && post.media_urls[0]) || null, status: post.status || "",
        owner: post.owner_key || "", publishingDate: post.publishing_date,
        mediaUrls: post.media_urls || [], caption: post.caption || "",
        airtableRecordId: post.airtable_record_id, assetLink: post.output_link,
        suggestedTime: slot.toISOString(),
        reason: reason || "Spaced a full day after the previous post, at your audience's peak hour — keeps the feed varied and gives each post room to breathe.",
        tags: tags.length ? tags : ["24h gap"],
      };
    });

    const hold = (ai.hold || [])
      .map((h) => { const p = candidates.find((c) => c.id === h.id); return p ? { id: p.id, title: p.particulars || "", reason: h.reason || "Too similar to a nearby post." } : null; })
      .filter(Boolean) as { id: string; title: string; reason: string }[];

    const payload = {
      page: PAGE, account: "@12thplus", sbu: SBU, minGapHours: 24, bestHours,
      last: last ? { title: last.particulars, type: last.type, interest: SBU, at: last.publishing_date } : null,
      summary: stripCites(ai.summary || "") || `Sequenced ${plan.length} post${plan.length === 1 ? "" : "s"} with a 24-hour minimum gap so they don't compete for reach.`,
      insight: stripCites(ai.insight || ""),
      plan, hold, calendar, rankedBy,
      generatedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Post planner failed"), { status: 502 });
  }
}
