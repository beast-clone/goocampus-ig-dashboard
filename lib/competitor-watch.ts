// The competitor watcher (docs/COMPETITOR_RADAR_SPEC.md, step 2).
//
// Run every few minutes by /api/cron/competitor-watch. For each tracked competitor
// it reads their website's sitemap and events/webinar pages, their YouTube feed and
// (every ~15 min) their Instagram, and records anything it hasn't seen before as an
// event in mh_competitor_events — which the Briefing shows and which becomes a
// notification for the team.
//
// Two rules keep it honest:
//   · The first read of any source is a BASELINE: everything goes into
//     mh_competitor_seen and nothing is announced. Otherwise the first run would
//     call Academically's 1,315 existing blog posts "new".
//   · A read that comes back empty (site down, blocked, sitemap moved) changes
//     nothing. An empty read must never look like "everything is new next time".
//
// Politeness: one request per page per run, a timeout on every fetch, and paths the
// site's robots.txt disallows are not fetched.

import { getSupabase } from "@/lib/supabase";
import { getAccount, fetchCompetitor } from "@/lib/instagram";

type SB = NonNullable<ReturnType<typeof getSupabase>>;
export type WatchEvent = { handle: string; name: string; kind: "blog" | "event" | "page" | "youtube" | "instagram"; title: string; url: string; publishedAt?: string | null };
export type WatchResult = { competitors: number; baselined: string[]; events: WatchEvent[]; errors: string[] };

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const EVENT_PATH = /(webinar|event|seminar|workshop|masterclass|conference|expo|live-session)/i;
const BLOG_PATH = /\/(blogs?|news-blogs?|news|articles?|news-articles|insights|resources)\//i;
const EVENT_WORDS = /\b(webinar|live session|go(ing)? live|seminar|workshop|masterclass|register|registration|events?|expo|fair|summit|conference|meet-?up|open house)\b/i;
const MAX_SUBSITEMAPS = 60;
const MAX_TITLES = 8;          // new pages whose <title> we fetch per competitor per run

async function get(url: string, ms = 12_000): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

// ── robots.txt ─────────────────────────────────────────────────────────────────
type Robots = { disallow: string[]; sitemaps: string[] };
async function robotsFor(origin: string): Promise<Robots> {
  const txt = await get(`${origin}/robots.txt`, 8_000);
  const out: Robots = { disallow: [], sitemaps: [] };
  if (!txt) return out;
  let applies = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") applies = val === "*";
    else if (key === "disallow" && applies && val) out.disallow.push(val);
    else if (key === "sitemap" && val) out.sitemaps.push(val);
  }
  return out;
}
const allowed = (r: Robots, url: string) => {
  try { const p = new URL(url).pathname; return !r.disallow.some((d) => p.startsWith(d)); } catch { return false; }
};

// ── sitemap ────────────────────────────────────────────────────────────────────
// Returns every page URL (with lastmod when given). Follows sitemap indexes. Some
// sites point their index at a host that no longer resolves (Hello Mentor's lists
// "temp.hellomentor.in"); those are retried on the site's own host.
async function sitemapUrls(origin: string, robots: Robots): Promise<Map<string, string | null>> {
  const pages = new Map<string, string | null>();
  const queue = robots.sitemaps.length ? [...robots.sitemaps] : [`${origin}/sitemap.xml`];
  const seen = new Set<string>();
  let subs = 0;
  while (queue.length && subs < MAX_SUBSITEMAPS) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm); subs++;
    let xml = await get(sm);
    if (!xml) {
      try { const u = new URL(sm); if (u.origin !== origin) xml = await get(origin + u.pathname + u.search); } catch { /* bad url */ }
    }
    if (!xml) continue;
    const isIndex = /<sitemapindex/i.test(xml);
    for (const block of xml.split(/<\/(?:url|sitemap)>/i)) {
      const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/i.exec(block)?.[1]?.replace(/&amp;/g, "&");
      if (!loc) continue;
      // Page URLs are put on the site's own host: Hello Mentor's sitemap lists every
      // page on a dead "temp." host, which would give broken links and hide /webinar.
      let page = loc;
      try { const u = new URL(loc); if (u.origin !== origin) page = origin + u.pathname + u.search; } catch { continue; }
      if (isIndex) queue.push(loc);
      else pages.set(page, /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i.exec(block)?.[1] || null);
    }
  }
  return pages;
}

const kindOfUrl = (u: string): WatchEvent["kind"] => (EVENT_PATH.test(u) ? "event" : BLOG_PATH.test(u) ? "blog" : "page");

async function titleOf(url: string): Promise<string> {
  const html = await get(url, 8_000);
  const t = html ? /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1] : null;
  return decode(t || "").replace(/\s+/g, " ").trim() || prettyPath(url);
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'");
const prettyPath = (u: string) => { try { return decodeURIComponent(new URL(u).pathname).split("/").filter(Boolean).pop()?.replace(/[-_]+/g, " ") || u; } catch { return u; } };

// ── events / webinar listing pages ─────────────────────────────────────────────
// A webinar is often announced as a card on /webinar before (or without) getting a
// page of its own. So the listing pages themselves are read and their event-looking
// links remembered; a new one is an event.
function eventLinks(html: string, pageUrl: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let abs: string;
    try { abs = new URL(m[1], pageUrl).toString(); } catch { continue; }
    const text = decode(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (abs.replace(/\/$/, "") === pageUrl.replace(/\/$/, "")) continue;
    if (!(EVENT_WORDS.test(text) || EVENT_PATH.test(abs) || /zoom\.us|meet\.google|forms\.|lu\.ma|eventbrite|register/i.test(abs))) continue;
    if (!out.has(abs)) out.set(abs, text.slice(0, 200));
  }
  return out;
}

// ── seen-set helpers ───────────────────────────────────────────────────────────
async function seenKeys(sb: SB, accountId: string, handle: string, source: string): Promise<Set<string> | null> {
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("mh_competitor_seen").select("item_key")
      .eq("account_id", accountId).eq("handle", handle).eq("source", source).range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data || []) as { item_key: string }[]) keys.add(r.item_key);
    if (!data || data.length < 1000) break;
  }
  return keys.size ? keys : null;   // null = never read before → baseline
}
async function remember(sb: SB, accountId: string, handle: string, source: string, keys: string[]) {
  for (let i = 0; i < keys.length; i += 500) {
    const rows = keys.slice(i, i + 500).map((item_key) => ({ account_id: accountId, handle, source, item_key }));
    const { error } = await sb.from("mh_competitor_seen").upsert(rows, { onConflict: "account_id,handle,source,item_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
}

// One source: compare what we read now with what we've seen; baseline if new.
async function diff(sb: SB, accountId: string, handle: string, source: string, now: string[], baselined: string[]): Promise<string[]> {
  if (!now.length) return [];                       // empty read: change nothing
  const before = await seenKeys(sb, accountId, handle, source);
  if (!before) { await remember(sb, accountId, handle, source, now); baselined.push(`${handle}:${source}`); return []; }
  const fresh = now.filter((k) => !before.has(k));
  if (fresh.length) await remember(sb, accountId, handle, source, fresh);
  return fresh;
}

// ── the run ────────────────────────────────────────────────────────────────────
export async function runCompetitorWatch(opts: { accountId?: string; instagram?: boolean } = {}): Promise<WatchResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const accountId = opts.accountId || "goocampus";
  const res: WatchResult = { competitors: 0, baselined: [], events: [], errors: [] };
  const account = getAccount(accountId);
  const ourHandle = (account?.handle || "").replace(/^@/, "").toLowerCase();

  const { data: comps, error } = await sb.from("mh_competitors").select("handle, name, website, youtube_channel, platform").eq("account_id", accountId);
  if (error) throw new Error(error.message);
  const list = ((comps || []) as { handle: string; name: string | null; website: string | null; youtube_channel: string | null; platform: string }[])
    .filter((c) => c.platform === "instagram" && c.handle !== ourHandle);
  res.competitors = list.length;

  for (const c of list) {
    const name = c.name || c.handle;
    const add = (e: Omit<WatchEvent, "handle" | "name">) => res.events.push({ ...e, handle: c.handle, name });

    // Website: sitemap + event listing pages.
    if (c.website) {
      try {
        const origin = new URL(c.website).origin;
        const robots = await robotsFor(origin);
        const pages = await sitemapUrls(origin, robots);
        const fresh = await diff(sb, accountId, c.handle, "sitemap", [...pages.keys()], res.baselined);
        for (const url of fresh.slice(0, 40)) {
          const i = fresh.indexOf(url);
          add({ kind: kindOfUrl(url), url, title: i < MAX_TITLES && allowed(robots, url) ? await titleOf(url) : prettyPath(url), publishedAt: pages.get(url) || null });
        }
        // Listing pages: the site's webinar/event pages (from the sitemap), at most 3.
        const listings = [...pages.keys()].filter((u) => EVENT_PATH.test(new URL(u).pathname.split("/").filter(Boolean)[0] || "")).slice(0, 3);
        for (const lp of listings) {
          if (!allowed(robots, lp)) continue;
          const html = await get(lp);
          if (!html) continue;
          const links = eventLinks(html, lp);
          const newLinks = await diff(sb, accountId, c.handle, `page:${lp}`, [...links.keys()], res.baselined);
          for (const url of newLinks.slice(0, 10)) add({ kind: "event", url, title: links.get(url) || prettyPath(url) });
        }
      } catch (e) { res.errors.push(`${name} website: ${(e as Error).message}`); }
    }

    // YouTube: the channel's uploads playlist via the Data API (1 quota unit per
    // channel per run). The free feeds/videos.xml started answering 404/500 (29 Sep).
    const ytKey = process.env.YOUTUBE_API_KEY;
    if (c.youtube_channel && ytKey && /^UC/.test(c.youtube_channel)) {
      try {
        const uploads = "UU" + c.youtube_channel.slice(2);
        const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=15&playlistId=${uploads}&key=${ytKey}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
        const j = r.ok ? await r.json() : { items: [] };
        const vids = new Map<string, { title: string; published: string | null }>();
        for (const it of (j.items || []) as { snippet?: { title?: string }; contentDetails?: { videoId?: string; videoPublishedAt?: string } }[]) {
          const id = it.contentDetails?.videoId;
          if (id) vids.set(id, { title: it.snippet?.title || "", published: it.contentDetails?.videoPublishedAt || null });
        }
        const fresh = await diff(sb, accountId, c.handle, "youtube", [...vids.keys()], res.baselined);
        for (const id of fresh) add({ kind: "youtube", url: `https://www.youtube.com/watch?v=${id}`, title: vids.get(id)?.title || "New video", publishedAt: vids.get(id)?.published });
      } catch (e) { res.errors.push(`${name} YouTube: ${(e as Error).message}`); }
    }

    // Instagram: rate-limited by Meta, so only when asked (the cron asks every ~15 min).
    if (opts.instagram && account) {
      try {
        const snap = await fetchCompetitor(account, c.handle);
        const posts = new Map((snap.recent || []).map((m) => [m.id, m] as const));
        const fresh = await diff(sb, accountId, c.handle, "instagram", [...posts.keys()], res.baselined);
        for (const id of fresh) {
          const m = posts.get(id)!;
          const cap = (m.caption || "").replace(/\s+/g, " ").trim();
          add({ kind: EVENT_WORDS.test(cap) ? "event" : "instagram", url: m.permalink || `https://www.instagram.com/${c.handle}/`, title: cap.slice(0, 160) || "New post", publishedAt: m.timestamp });
        }
      } catch (e) { res.errors.push(`${name} Instagram: ${(e as Error).message}`); }
    }
  }

  // Store events (unique on account+handle+kind+url, so a retry can't double them).
  if (res.events.length) {
    const rows = res.events.map((e) => ({ account_id: accountId, handle: e.handle, kind: e.kind, title: e.title, url: e.url, published_at: e.publishedAt && !Number.isNaN(Date.parse(e.publishedAt)) ? new Date(e.publishedAt).toISOString() : null }));
    const { error: insErr } = await sb.from("mh_competitor_events").upsert(rows, { onConflict: "account_id,handle,kind,url", ignoreDuplicates: true });
    if (insErr) res.errors.push(`saving events: ${insErr.message}`);
  }
  return res;
}
