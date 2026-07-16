import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabase } from "@/lib/supabase";
import { getTopTimeSuggestions, getTopPerformers } from "@/lib/scheduler-helpers";
import { safeError } from "@/lib/errors";

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

    // ---- AI: decide the ORDER ----
    const ctx = {
      lastPublished: last ? { title: last.particulars, type: last.type, caption: snippet(last.caption || last.content) } : null,
      whatWorks: top.map((t) => ({ type: t.mediaType, caption: snippet(t.caption, 80), reach: t.reach })),
      candidates: candidates.map((c) => ({
        id: c.id, title: c.particulars || "", type: c.type || "", status: c.status || "",
        priority: c.priority || "", caption: snippet(c.caption || c.content, 120),
      })),
    };

    type AIOrder = { summary?: string; insight?: string; order?: { id: string; reason?: string; tags?: string[] }[]; hold?: { id: string; reason?: string }[] };
    let ai: AIOrder = {};
    const key = process.env.OPENAI_API_KEY;
    if (key) {
      try {
        const client = new OpenAI({ apiKey: key });
        const resp = await client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You schedule Instagram posts for @12thplus — an Indian education account for students after 12th grade (NEET UG, courses/careers after 12th, competitive exams, colleges).",
                "You get the LAST published post, a list of CANDIDATE posts waiting in the pipeline, and what has historically performed.",
                "Decide the ORDER to publish the candidates. A minimum 24-HOUR gap is ENFORCED for you separately — focus ONLY on order and topic/format spacing, NOT exact times.",
                "",
                "RULES:",
                "  1. Never place two posts of the SAME topic or SAME format back-to-back — they compete for the same viewers and split each other's reach (cannibalisation). Separate similar posts.",
                "  2. Lead with the candidate most likely to perform — use what has historically worked (high-reach formats/topics) and 'priority' where set.",
                "  3. Alternate formats where possible (reel → carousel → reel) for feed variety.",
                "  4. A strong post should be FOLLOWED by something complementary (a different angle / next step for the same audience), not a near-duplicate.",
                "  5. If a candidate is too similar to the LAST published post, push it later or move it to `hold`.",
                "",
                "Return JSON: { summary: string (1 sentence), insight: string (1 sentence on what works for this account), order: [{ id, reason (1 concrete sentence), tags: string[] }] (every candidate id, in publish order), hold: [{ id, reason }] (candidates to NOT put next, optional) }.",
                "tags are short labels like: 'proven format', 'different topic', 'format variety', 'complements last post', 'fresh angle', 'priority'.",
              ].join("\n"),
            },
            { role: "user", content: JSON.stringify(ctx) },
          ],
        });
        ai = JSON.parse(resp.choices[0]?.message?.content || "{}") as AIOrder;
      } catch { ai = {}; }
    }

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const holdIds = new Set((ai.hold || []).map((h) => h.id));
    const ordered: { post: MhRow; reason: string; tags: string[] }[] = [];
    for (const o of ai.order || []) {
      const post = byId.get(o.id);
      if (post && !holdIds.has(o.id)) { ordered.push({ post, reason: o.reason || "", tags: o.tags || [] }); byId.delete(o.id); }
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
      summary: ai.summary || `Sequenced ${plan.length} post${plan.length === 1 ? "" : "s"} with a 24-hour minimum gap so they don't compete for reach.`,
      insight: ai.insight || "",
      plan, hold, calendar,
      generatedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Post planner failed"), { status: 502 });
  }
}
