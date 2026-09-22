// Keywords & hashtags for Instagram and YouTube — doctors only (SEO tab).
//
// Everything here is REAL data, never estimated:
//   • our own Instagram posts (captions + likes/comments) and YouTube uploads (titles
//     + views), and
//   • doctor-education competitors: their Instagram posts via Instagram Business
//     Discovery (public posts of business accounts) and their YouTube uploads.
// From those we pull hashtags and doctor-exam keywords and score each by how many
// accounts use it and how well the posts using it perform. There is no search
// volume here — none of these APIs give one — so nothing pretends to be one.
// Cached 24h: competitor data changes slowly and every read costs API quota.

import { cached, clearCache } from "@/lib/api-cache";
import { getAccount } from "@/lib/instagram";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { youtubeGet } from "@/lib/youtube";
import { getSupabase } from "@/lib/supabase";

// Doctor-education accounts (checked 22 Sep 2026 via Business Discovery).
export const IG_COMPETITORS = [
  "hellomentor.in", "moksh_academy", "icmeindia", "karanguptaconsulting",
  "doctutorials", "prepladder_med", "marrowmed", "dams_delhi", "cerebellumacademy",
];
// Same organisations on YouTube (resolved by @handle; unknown handles are skipped).
export const YT_COMPETITORS = [
  "hellomentor_hm", "MokshAcademy", "DocTutorials", "prepladdermedpg", "MarrowMed", "DAMSDelhi", "CerebellumAcademy",
];

// Accounts the team adds from the SEO tab ("+ Add account"). Stored in discover_cache
// (no migration), one row each, alongside the built-in lists above. Removing a
// built-in account stores a "hidden" row instead; adding it again un-hides it.
const EXTRA_SOURCE = "seo_account";
const HIDDEN_SOURCE = "seo_account_hidden";
const hiddenKey = (p: string, h: string) => `seo-hidden:${p}:${h.toLowerCase()}`;
const builtInFor = (p: string) => (p === "instagram" ? IG_COMPETITORS : YT_COMPETITORS);
async function listHidden(): Promise<Set<string>> {
  const sb = getSupabase();
  if (!sb) return new Set();
  const { data } = await sb.from("discover_cache").select("cache_key").eq("source", HIDDEN_SOURCE);
  return new Set((data || []).map((r) => r.cache_key as string));
}
export type ExtraAccount = { platform: "instagram" | "youtube"; handle: string; addedBy?: string; addedAt: string };
const extraKey = (p: string, h: string) => `seo-account:${p}:${h.toLowerCase()}`;
export const cleanHandle = (h: string) => h.trim().replace(/^https?:\/\/(www\.)?(instagram\.com|youtube\.com)\//i, "").replace(/^@+/, "").replace(/[/?#].*$/, "");

export async function listExtraAccounts(): Promise<ExtraAccount[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("discover_cache").select("payload").eq("source", EXTRA_SOURCE).order("last_fetched", { ascending: true });
  return (data || []).map((r) => r.payload as ExtraAccount).filter((a) => a?.handle);
}
// Checks the account can be read before saving it; returns its display name.
export async function addExtraAccount(platform: "instagram" | "youtube", handle: string, addedBy?: string): Promise<string> {
  const sb0 = getSupabase();
  const builtIn = builtInFor(platform).find((h) => h.toLowerCase() === handle.toLowerCase());
  if (builtIn) {
    const hidden = await listHidden();
    if (!hidden.has(hiddenKey(platform, builtIn))) throw new Error("That account is already tracked.");
    await sb0?.from("discover_cache").delete().eq("cache_key", hiddenKey(platform, builtIn)).eq("source", HIDDEN_SOURCE);
    return builtIn;
  }
  if (handle.toLowerCase() === "goocampus") throw new Error("That's us — already tracked.");
  let name: string;
  if (platform === "instagram") {
    const acc = getAccount("goocampus");
    if (!acc) throw new Error("Instagram isn't connected.");
    try {
      const j = await igGet<{ business_discovery?: { name?: string; username?: string } }>(acc.igUserId, { fields: `business_discovery.username(${handle}){name,username}`, access_token: acc.pageAccessToken });
      if (!j.business_discovery) throw new Error("x");
      name = j.business_discovery.name || handle;
    } catch { throw new Error(`Couldn't read @${handle} on Instagram. Check the handle — only business or creator accounts can be read.`); }
  } else {
    const ch = await youtubeGet<{ items?: { snippet?: { title?: string } }[] }>(`channels?part=snippet&forHandle=${encodeURIComponent(handle)}`);
    if (!ch.items?.length) throw new Error(`No YouTube channel found for @${handle}.`);
    name = ch.items[0].snippet?.title || handle;
  }
  const sb = getSupabase();
  if (!sb) throw new Error("Database isn't configured.");
  const row: ExtraAccount = { platform, handle, addedBy, addedAt: new Date().toISOString() };
  const { error } = await sb.from("discover_cache").upsert({ cache_key: extraKey(platform, handle), source: EXTRA_SOURCE, last_fetched: row.addedAt, payload: row }, { onConflict: "cache_key" });
  if (error) throw new Error(error.message);
  return name;
}
export async function removeExtraAccount(platform: string, handle: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (handle.toLowerCase() === "goocampus") throw new Error("Our own account can't be removed.");
  const builtIn = builtInFor(platform).find((h) => h.toLowerCase() === handle.toLowerCase());
  const { error } = builtIn
    ? await sb.from("discover_cache").upsert({ cache_key: hiddenKey(platform, builtIn), source: HIDDEN_SOURCE, last_fetched: new Date().toISOString(), payload: { platform, handle: builtIn } }, { onConflict: "cache_key" })
    : await sb.from("discover_cache").delete().eq("cache_key", extraKey(platform, handle)).eq("source", EXTRA_SOURCE);
  if (error) throw new Error(error.message);
}

// Doctor-career topics GooCampus works in. A post "uses" a keyword when its text
// contains any of the variants (case-insensitive).
export const DOCTOR_KEYWORDS: { keyword: string; match: RegExp }[] = [
  { keyword: "NEET PG", match: /\bneet[\s-]?pg\b/i },
  { keyword: "INI-CET", match: /\bini[\s-]?cet\b/i },
  { keyword: "FMGE", match: /\bfmge\b/i },
  { keyword: "NExT exam", match: /\bnext\s+exam\b|\bnmc\s+next\b/i },
  { keyword: "PLAB", match: /\bplab\b/i },
  { keyword: "UKMLA", match: /\bukmla\b/i },
  { keyword: "AMC exam", match: /\bamc\b/i },
  { keyword: "USMLE", match: /\busmle\b/i },
  { keyword: "DHA exam", match: /\bdha\b/i },
  { keyword: "HAAD / DOH", match: /\bhaad\b|\bdoh\s+exam\b/i },
  { keyword: "Prometric", match: /\bprometric\b/i },
  { keyword: "OET", match: /\boet\b/i },
  { keyword: "IELTS for doctors", match: /\bielts\b/i },
  { keyword: "MRCP", match: /\bmrcp\b/i },
  { keyword: "MRCS", match: /\bmrcs\b/i },
  { keyword: "MBBS abroad", match: /\bmbbs\s+abroad\b/i },
  { keyword: "PG abroad", match: /\b(pg|post[\s-]?graduation)\s+(abroad|in\s+(uk|usa|australia|germany|ireland))\b/i },
  { keyword: "Doctor jobs abroad", match: /\bdoctor\s+jobs?\b|\bjobs?\s+for\s+doctors\b/i },
  { keyword: "Medical residency", match: /\bresidency\b/i },
  { keyword: "NHS jobs", match: /\bnhs\b/i },
  { keyword: "GMC registration", match: /\bgmc\b/i },
  { keyword: "AHPRA registration", match: /\bahpra\b/i },
  { keyword: "IMG doctors", match: /\bimgs?\b|\binternational\s+medical\s+graduates?\b/i },
  { keyword: "NEET counselling", match: /\bneet\s+(pg\s+)?counsel+ing\b|\bcounsel+ing\b/i },
  { keyword: "Medical PG seats", match: /\bpg\s+seats?\b|\bmd\s*\/?\s*ms\s+seats?\b/i },
  { keyword: "Clinical attachment", match: /\bclinical\s+(attachment|observership)\b|\bobservership\b/i },
];

// `text` is searched for doctor keywords; `tagText` for hashtags. They differ on
// YouTube: keywords come from the title + tags only (our video descriptions carry the
// same boilerplate, which made every video "mention" PLAB/AMC/USMLE).
type Item = { text: string; tagText?: string; engagement: number; source: "ours" | "competitor"; account: string; url?: string; date?: string };
// One post/video as shown in the SEO tab's account grid.
export type AccountPost = {
  url?: string; image?: string; caption: string; date?: string; engagement: number; keywords: string[];
  likes?: number; comments?: number; views?: number;
  reach?: number; saves?: number; shares?: number; // our Instagram posts only (insights)
};
export type AccountSummary = {
  platform: "instagram" | "youtube"; account: string; name?: string; followers?: number; analysed: number; error?: string;
  pic?: string; posts?: AccountPost[];
  custom?: boolean; // added by the team from the SEO tab (can be removed)
  stale?: string;   // this read failed; showing the last good one (the error)
};
export type KeywordRow = {
  keyword: string; kind: "hashtag" | "keyword"; platform: "instagram" | "youtube";
  accounts: number;          // how many accounts (ours + competitors) use it
  competitors: string[];     // which competitors use it
  posts: number;             // posts/videos using it
  avgEngagement: number;     // avg likes+comments (Instagram) or views (YouTube) of those posts
  oursPosts: number;         // how many of OUR posts use it
  oursAvgEngagement: number | null;
  oursList: { url: string; snippet: string; engagement: number; date?: string }[]; // our posts using it, best first (max 10)
  topic: string;             // group it belongs to (see TOPICS)
};

// Topic groups the SEO tab shows keywords in, so a whole set can be copied at once.
// First match wins; everything else lands in "General medical".
export const TOPICS: { topic: string; match: RegExp }[] = [
  { topic: "NEET PG & INI-CET", match: /neet\s*-?\s*pg|inicet|ini-cet|neetss|neet\s*ss|\bpg\s*seats|counsel|neetpg/i },
  { topic: "FMGE & NExT", match: /fmge|\bnext\b|nmcnext|nextexam/i },
  { topic: "UK — PLAB, GMC, NHS", match: /plab|gmc|nhs|ukmla|mrcp|mrcs|\buk\b|ukdoctor|britain|england/i },
  { topic: "Australia — AMC, AHPRA", match: /\bamc|ahpra|australia/i },
  { topic: "USA — USMLE", match: /usmle|\busa\b|residency|match\b|ecfmg/i },
  { topic: "Gulf — DHA, HAAD, Prometric", match: /\bdha|haad|\bdoh|prometric|dubai|uae|gulf|saudi|qatar|oman|kuwait|moh\b/i },
  { topic: "English tests — OET, IELTS", match: /oet|ielts/i },
  { topic: "Working abroad", match: /abroad|img|international\s*medical|doctorjobs|jobs|observership|clinical\s*attachment|mbbsabroad/i },
];
const topicOf = (k: string) => TOPICS.find((t) => t.match.test(k))?.topic || "General medical";

const HASHTAG = /#[\p{L}\p{N}_]{3,40}/gu;

// Last good read per account. When a read fails (Instagram's hourly request limit,
// a blip) the account keeps its previous posts instead of dropping out of the counts.
// Kept in discover_cache (source seo_account_data) so it survives restarts and is
// shared by every server instance; loaded once per read, saved once at the end.
const DATA_SOURCE = "seo_account_data";
let lastGood = new Map<string, { items: Item[]; summary: AccountSummary }>();
let fresh: { key: string; items: Item[]; summary: AccountSummary }[] = [];
function keep(key: string, items: Item[], summary: AccountSummary) { lastGood.set(key, { items, summary }); fresh.push({ key, items, summary }); }
async function loadLastGood() {
  fresh = [];
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from("discover_cache").select("cache_key,payload").eq("source", DATA_SOURCE);
  lastGood = new Map((data || []).map((r) => [String(r.cache_key).replace(/^seo-data:/, ""), r.payload as { items: Item[]; summary: AccountSummary }]));
}
async function saveLastGood() {
  const sb = getSupabase();
  if (!sb || !fresh.length) return;
  const now = new Date().toISOString();
  await sb.from("discover_cache").upsert(fresh.map((f) => ({ cache_key: `seo-data:${f.key}`, source: DATA_SOURCE, last_fetched: now, payload: { items: f.items, summary: f.summary } })), { onConflict: "cache_key" });
}
// Once Instagram says the app is over its hourly limit, every further call fails too
// and only extends it — so stop asking for the rest of this read.
const isRateLimit = (m: string) => /request limit|rate limit|\(#4\)|\(#32\)|\(#613\)/i.test(m);
function fallback(key: string, error: string, custom?: boolean): { items: Item[]; summary: AccountSummary } | null {
  const g = lastGood.get(key);
  return g ? { items: g.items, summary: { ...g.summary, custom, stale: error } } : null;
}

// ── Instagram ──────────────────────────────────────────────────────────────
type IgMedia = {
  caption?: string; like_count?: number; comments_count?: number; permalink?: string; timestamp?: string; media_type?: string; media_url?: string; thumbnail_url?: string;
  insights?: { data?: { name: string; values?: { value?: number }[] }[] };
};
// Our own posts also carry insights (other accounts' insights aren't shared).
const OWN_MEDIA_FIELDS = "caption,like_count,comments_count,permalink,timestamp,media_type,media_url,thumbnail_url,insights.metric(reach,views,saved,shares)";
const IG_MEDIA_FIELDS = "caption,like_count,comments_count,permalink,timestamp,media_type,media_url,thumbnail_url";
// Hashtags + doctor keywords found in one post (same rules as the scoring below).
function keywordsIn(text: string, tagText = text): string[] {
  const tags = [...new Set((tagText.match(HASHTAG) || []).map((h) => h.toLowerCase()))];
  return [...DOCTOR_KEYWORDS.filter((k) => k.match.test(text)).map((k) => k.keyword), ...tags];
}
const igPost = (m: IgMedia, eng: number): AccountPost => {
  const ins = (n: string) => m.insights?.data?.find((d) => d.name === n)?.values?.[0]?.value;
  return {
    url: m.permalink, image: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url,
    caption: (m.caption || "").slice(0, 400), date: m.timestamp, engagement: eng, keywords: keywordsIn(m.caption || ""),
    likes: m.like_count, comments: m.comments_count, reach: ins("reach"), views: ins("views"), saves: ins("saved"), shares: ins("shares"),
  };
};
async function igGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const r = await fetchWithTimeout(`https://graph.facebook.com/v25.0/${path}?${new URLSearchParams(params)}`, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || `Instagram ${r.status}`);
  return j as T;
}
async function instagramItems(extra: string[], hidden: Set<string>): Promise<{ items: Item[]; accounts: AccountSummary[] }> {
  const acc = getAccount("goocampus");
  if (!acc) return { items: [], accounts: [{ platform: "instagram", account: "goocampus", analysed: 0, error: "Instagram not connected" }] };
  const items: Item[] = [], accounts: AccountSummary[] = [];
  const eng = (m: IgMedia) => (m.like_count || 0) + (m.comments_count || 0);

  try {
    const [own, me] = await Promise.all([
      igGet<{ data: IgMedia[] }>(`${acc.igUserId}/media`, { fields: OWN_MEDIA_FIELDS, limit: "60", access_token: acc.pageAccessToken }),
      igGet<{ name?: string; followers_count?: number; profile_picture_url?: string }>(acc.igUserId, { fields: "name,followers_count,profile_picture_url", access_token: acc.pageAccessToken }).catch(() => null),
    ]);
    for (const m of own.data || []) if (m.caption) items.push({ text: m.caption, engagement: eng(m), source: "ours", account: acc.handle || "goocampus", url: m.permalink, date: m.timestamp });
    accounts.push({ platform: "instagram", account: acc.handle || "goocampus", name: me?.name, followers: me?.followers_count, pic: me?.profile_picture_url,
      analysed: (own.data || []).length, posts: (own.data || []).map((m) => igPost(m, eng(m))) });
  } catch (e) { accounts.push({ platform: "instagram", account: acc.handle || "goocampus", analysed: 0, error: (e as Error).message.slice(0, 120) }); }

  let limited = "";
  for (const u of [...IG_COMPETITORS.filter((h) => !hidden.has(hiddenKey("instagram", h))), ...extra]) {
    try {
      if (limited) throw new Error(limited);
      const j = await igGet<{ business_discovery?: { name?: string; followers_count?: number; profile_picture_url?: string; media?: { data: IgMedia[] } } }>(acc.igUserId, {
        fields: `business_discovery.username(${u}){name,followers_count,profile_picture_url,media.limit(40){${IG_MEDIA_FIELDS}}}`,
        access_token: acc.pageAccessToken,
      });
      const bd = j.business_discovery;
      const media = bd?.media?.data || [];
      const mine: Item[] = media.filter((m) => m.caption).map((m) => ({ text: m.caption!, engagement: eng(m), source: "competitor" as const, account: u }));
      const summary: AccountSummary = { platform: "instagram", account: u, name: bd?.name, followers: bd?.followers_count, pic: bd?.profile_picture_url,
        analysed: media.length, posts: media.map((m) => igPost(m, eng(m))), custom: extra.includes(u) || undefined };
      items.push(...mine); accounts.push(summary); keep(`instagram:${u}`, mine, summary);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 120), fb = fallback(`instagram:${u}`, msg, extra.includes(u) || undefined);
      if (isRateLimit(msg)) limited = msg;
      if (fb) { items.push(...fb.items); accounts.push(fb.summary); }
      else accounts.push({ platform: "instagram", account: u, analysed: 0, error: msg, custom: extra.includes(u) || undefined });
    }
  }
  return { items, accounts };
}

// ── YouTube ────────────────────────────────────────────────────────────────
type YtThumbs = { default?: { url?: string }; medium?: { url?: string }; high?: { url?: string } };
async function channelVideos(handle: string): Promise<{ name: string; subs: number; pic?: string; videos: { text: string; tagText: string; views: number; likes: number; comments: number; url: string; title: string; image?: string; date?: string }[] } | null> {
  const ch = await youtubeGet<{ items?: { snippet?: { title?: string; thumbnails?: YtThumbs }; statistics?: { subscriberCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(
    `channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(handle)}`);
  const c = ch.items?.[0];
  const uploads = c?.contentDetails?.relatedPlaylists?.uploads;
  if (!c || !uploads) return null;
  const pl = await youtubeGet<{ items?: { contentDetails?: { videoId?: string } }[] }>(`playlistItems?part=contentDetails&maxResults=40&playlistId=${uploads}`);
  const ids = (pl.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean).join(",");
  const pic = c.snippet?.thumbnails?.medium?.url || c.snippet?.thumbnails?.default?.url;
  if (!ids) return { name: c.snippet?.title || handle, subs: Number(c.statistics?.subscriberCount || 0), pic, videos: [] };
  const vr = await youtubeGet<{ items?: { id?: string; snippet?: { title?: string; tags?: string[]; description?: string; publishedAt?: string; thumbnails?: YtThumbs }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(`videos?part=snippet,statistics&id=${ids}`);
  return {
    name: c.snippet?.title || handle,
    subs: Number(c.statistics?.subscriberCount || 0), pic,
    // Title + tags carry the keywords; title + the description's opening lines the hashtags.
    videos: (vr.items || []).map((v) => ({
      text: `${v.snippet?.title || ""} ${(v.snippet?.tags || []).join(" ")}`,
      tagText: `${v.snippet?.title || ""} ${(v.snippet?.description || "").slice(0, 400)}`,
      views: Number(v.statistics?.viewCount || 0), likes: Number(v.statistics?.likeCount || 0), comments: Number(v.statistics?.commentCount || 0),
      url: `https://www.youtube.com/watch?v=${v.id}`, title: v.snippet?.title || "", date: v.snippet?.publishedAt,
      image: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url,
    })),
  };
}
async function youtubeItems(extra: string[], hidden: Set<string>): Promise<{ items: Item[]; accounts: AccountSummary[] }> {
  const items: Item[] = [], accounts: AccountSummary[] = [];
  const all = [{ handle: "goocampus", ours: true }, ...[...YT_COMPETITORS.filter((h) => !hidden.has(hiddenKey("youtube", h))), ...extra].map((h) => ({ handle: h, ours: false }))];
  for (const { handle, ours } of all) {
    try {
      const r = await channelVideos(handle);
      const custom = extra.includes(handle) || undefined;
      if (!r) { accounts.push({ platform: "youtube", account: handle, analysed: 0, error: "Channel not found", custom }); continue; }
      const mine: Item[] = r.videos.map((v) => ({ text: v.text, tagText: v.tagText, engagement: v.views, source: ours ? "ours" as const : "competitor" as const, account: handle, url: v.url, date: v.date }));
      const summary: AccountSummary = { platform: "youtube", account: handle, name: r.name, followers: r.subs, pic: r.pic, analysed: r.videos.length,
        posts: r.videos.map((v) => ({ url: v.url, image: v.image, caption: v.title, date: v.date, engagement: v.views, views: v.views, likes: v.likes, comments: v.comments, keywords: keywordsIn(v.text, v.tagText) })), custom };
      items.push(...mine); accounts.push(summary); keep(`youtube:${handle}`, mine, summary);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 120), fb = fallback(`youtube:${handle}`, msg, extra.includes(handle) || undefined);
      if (fb) { items.push(...fb.items); accounts.push(fb.summary); }
      else accounts.push({ platform: "youtube", account: handle, analysed: 0, error: msg, custom: extra.includes(handle) || undefined });
    }
  }
  return { items, accounts };
}

// ── Scoring ────────────────────────────────────────────────────────────────
function score(items: Item[], platform: "instagram" | "youtube"): KeywordRow[] {
  type Acc = { kind: KeywordRow["kind"]; accounts: Set<string>; comps: Set<string>; posts: number; eng: number; oursPosts: number; oursEng: number; oursList: KeywordRow["oursList"] };
  const map = new Map<string, Acc>();
  const bump = (key: string, kind: KeywordRow["kind"], it: Item) => {
    const a = map.get(key) || { kind, accounts: new Set(), comps: new Set(), posts: 0, eng: 0, oursPosts: 0, oursEng: 0, oursList: [] };
    a.accounts.add(it.account); if (it.source === "competitor") a.comps.add(it.account);
    a.posts += 1; a.eng += it.engagement;
    if (it.source === "ours") {
      a.oursPosts += 1; a.oursEng += it.engagement;
      if (it.url) a.oursList.push({ url: it.url, snippet: it.text.replace(/\s+/g, " ").slice(0, 90), engagement: it.engagement, date: it.date });
    }
    map.set(key, a);
  };
  for (const it of items) {
    const tags = new Set(((it.tagText ?? it.text).match(HASHTAG) || []).map((h) => h.toLowerCase()));
    for (const t of tags) bump(t, "hashtag", it);
    for (const k of DOCTOR_KEYWORDS) if (k.match.test(it.text)) bump(k.keyword, "keyword", it);
  }
  return [...map.entries()]
    .filter(([, a]) => a.kind === "keyword" || a.accounts.size >= 2 || a.oursPosts >= 2) // one-off hashtags are noise
    .map(([keyword, a]) => ({
      keyword, kind: a.kind, platform, accounts: a.accounts.size, competitors: [...a.comps], posts: a.posts,
      avgEngagement: Math.round(a.eng / a.posts), oursPosts: a.oursPosts, oursAvgEngagement: a.oursPosts ? Math.round(a.oursEng / a.oursPosts) : null,
      oursList: a.oursList.sort((x, y) => y.engagement - x.engagement).slice(0, 10),
      topic: topicOf(keyword),
    }))
    .sort((x, y) => y.accounts - x.accounts || y.avgEngagement - x.avgEngagement);
}

export type SocialKeywords = {
  instagram: KeywordRow[]; youtube: KeywordRow[]; accounts: AccountSummary[];
  oursAvg: { instagram: number | null; youtube: number | null }; fetchedAt: string;
};

export function getSocialKeywords(refresh = false): Promise<SocialKeywords> {
  const build = async (): Promise<SocialKeywords> => {
    const [extra, hidden] = await Promise.all([listExtraAccounts().catch(() => []), listHidden().catch(() => new Set<string>()), loadLastGood().catch(() => {})]);
    const of = (p: string) => extra.filter((a) => a.platform === p).map((a) => a.handle);
    const [ig, yt] = await Promise.all([instagramItems(of("instagram"), hidden), youtubeItems(of("youtube"), hidden)]);
    await saveLastGood().catch(() => {});
    const avg = (xs: Item[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x.engagement, 0) / xs.length) : null);
    return {
      instagram: score(ig.items, "instagram"),
      youtube: score(yt.items, "youtube"),
      accounts: [...ig.accounts, ...yt.accounts],
      oursAvg: { instagram: avg(ig.items.filter((i) => i.source === "ours")), youtube: avg(yt.items.filter((i) => i.source === "ours")) },
      fetchedAt: new Date().toISOString(),
    };
  };
  // A refresh replaces the cached copy, so the next normal load sees it too.
  if (refresh) { clearCache("social-keywords:"); degraded = null; }
  // A read where accounts failed (e.g. Instagram's hourly limit) is kept 15 min, not
  // 24h — and not retried on every page load, which would only keep the limit hit.
  if (degraded && Date.now() - degraded.at < 15 * 60_000) return Promise.resolve(degraded.data);
  const ok = (d: SocialKeywords) => d.instagram.length + d.youtube.length > 0 && !d.accounts.some((x) => x.error || x.stale);
  return cached("social-keywords:v4", 24 * 60 * 60_000, build, ok).then((d) => { if (!ok(d)) degraded = { at: Date.now(), data: d }; return d; });
}
let degraded: { at: number; data: SocialKeywords } | null = null;
