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

import { cached } from "@/lib/api-cache";
import { getAccount } from "@/lib/instagram";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { youtubeGet } from "@/lib/youtube";

// Doctor-education accounts (checked 22 Sep 2026 via Business Discovery).
export const IG_COMPETITORS = [
  "hellomentor.in", "moksh_academy", "icmeindia", "karanguptaconsulting",
  "doctutorials", "prepladder_med", "marrowmed", "dams_delhi", "cerebellumacademy",
];
// Same organisations on YouTube (resolved by @handle; unknown handles are skipped).
export const YT_COMPETITORS = [
  "hellomentor_hm", "MokshAcademy", "DocTutorials", "prepladdermedpg", "MarrowMed", "DAMSDelhi", "CerebellumAcademy",
];

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
export type AccountSummary = { platform: "instagram" | "youtube"; account: string; name?: string; followers?: number; analysed: number; error?: string };
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

// ── Instagram ──────────────────────────────────────────────────────────────
type IgMedia = { caption?: string; like_count?: number; comments_count?: number };
async function igGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const r = await fetchWithTimeout(`https://graph.facebook.com/v25.0/${path}?${new URLSearchParams(params)}`, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || `Instagram ${r.status}`);
  return j as T;
}
async function instagramItems(): Promise<{ items: Item[]; accounts: AccountSummary[] }> {
  const acc = getAccount("goocampus");
  if (!acc) return { items: [], accounts: [{ platform: "instagram", account: "goocampus", analysed: 0, error: "Instagram not connected" }] };
  const items: Item[] = [], accounts: AccountSummary[] = [];
  const eng = (m: IgMedia) => (m.like_count || 0) + (m.comments_count || 0);

  try {
    const own = await igGet<{ data: (IgMedia & { permalink?: string; timestamp?: string })[] }>(`${acc.igUserId}/media`, { fields: "caption,like_count,comments_count,permalink,timestamp", limit: "60", access_token: acc.pageAccessToken });
    for (const m of own.data || []) if (m.caption) items.push({ text: m.caption, engagement: eng(m), source: "ours", account: acc.handle || "goocampus", url: m.permalink, date: m.timestamp });
    accounts.push({ platform: "instagram", account: acc.handle || "goocampus", analysed: (own.data || []).length });
  } catch (e) { accounts.push({ platform: "instagram", account: acc.handle || "goocampus", analysed: 0, error: (e as Error).message.slice(0, 120) }); }

  for (const u of IG_COMPETITORS) {
    try {
      const j = await igGet<{ business_discovery?: { name?: string; followers_count?: number; media?: { data: IgMedia[] } } }>(acc.igUserId, {
        fields: `business_discovery.username(${u}){name,followers_count,media.limit(40){caption,like_count,comments_count}}`,
        access_token: acc.pageAccessToken,
      });
      const bd = j.business_discovery;
      const media = bd?.media?.data || [];
      for (const m of media) if (m.caption) items.push({ text: m.caption, engagement: eng(m), source: "competitor", account: u });
      accounts.push({ platform: "instagram", account: u, name: bd?.name, followers: bd?.followers_count, analysed: media.length });
    } catch (e) { accounts.push({ platform: "instagram", account: u, analysed: 0, error: (e as Error).message.slice(0, 120) }); }
  }
  return { items, accounts };
}

// ── YouTube ────────────────────────────────────────────────────────────────
async function channelVideos(handle: string): Promise<{ name: string; subs: number; videos: { text: string; tagText: string; views: number; url: string; title: string; date?: string }[] } | null> {
  const ch = await youtubeGet<{ items?: { snippet?: { title?: string }; statistics?: { subscriberCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(
    `channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(handle)}`);
  const c = ch.items?.[0];
  const uploads = c?.contentDetails?.relatedPlaylists?.uploads;
  if (!c || !uploads) return null;
  const pl = await youtubeGet<{ items?: { contentDetails?: { videoId?: string } }[] }>(`playlistItems?part=contentDetails&maxResults=40&playlistId=${uploads}`);
  const ids = (pl.items || []).map((i) => i.contentDetails?.videoId).filter(Boolean).join(",");
  if (!ids) return { name: c.snippet?.title || handle, subs: Number(c.statistics?.subscriberCount || 0), videos: [] };
  const vr = await youtubeGet<{ items?: { id?: string; snippet?: { title?: string; tags?: string[]; description?: string; publishedAt?: string }; statistics?: { viewCount?: string } }[] }>(`videos?part=snippet,statistics&id=${ids}`);
  return {
    name: c.snippet?.title || handle,
    subs: Number(c.statistics?.subscriberCount || 0),
    // Title + tags carry the keywords; title + the description's opening lines the hashtags.
    videos: (vr.items || []).map((v) => ({
      text: `${v.snippet?.title || ""} ${(v.snippet?.tags || []).join(" ")}`,
      tagText: `${v.snippet?.title || ""} ${(v.snippet?.description || "").slice(0, 400)}`,
      views: Number(v.statistics?.viewCount || 0),
      url: `https://www.youtube.com/watch?v=${v.id}`, title: v.snippet?.title || "", date: v.snippet?.publishedAt,
    })),
  };
}
async function youtubeItems(): Promise<{ items: Item[]; accounts: AccountSummary[] }> {
  const items: Item[] = [], accounts: AccountSummary[] = [];
  const all = [{ handle: "goocampus", ours: true }, ...YT_COMPETITORS.map((h) => ({ handle: h, ours: false }))];
  for (const { handle, ours } of all) {
    try {
      const r = await channelVideos(handle);
      if (!r) { accounts.push({ platform: "youtube", account: handle, analysed: 0, error: "Channel not found" }); continue; }
      for (const v of r.videos) items.push({ text: v.text, tagText: v.tagText, engagement: v.views, source: ours ? "ours" : "competitor", account: handle, url: v.url, date: v.date });
      accounts.push({ platform: "youtube", account: handle, name: r.name, followers: r.subs, analysed: r.videos.length });
    } catch (e) { accounts.push({ platform: "youtube", account: handle, analysed: 0, error: (e as Error).message.slice(0, 120) }); }
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

export function getSocialKeywords(fresh = false): Promise<SocialKeywords> {
  const build = async (): Promise<SocialKeywords> => {
    const [ig, yt] = await Promise.all([instagramItems(), youtubeItems()]);
    const avg = (xs: Item[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x.engagement, 0) / xs.length) : null);
    return {
      instagram: score(ig.items, "instagram"),
      youtube: score(yt.items, "youtube"),
      accounts: [...ig.accounts, ...yt.accounts],
      oursAvg: { instagram: avg(ig.items.filter((i) => i.source === "ours")), youtube: avg(yt.items.filter((i) => i.source === "ours")) },
      fetchedAt: new Date().toISOString(),
    };
  };
  return fresh ? build() : cached("social-keywords:v2", 24 * 60 * 60_000, build, (d) => d.instagram.length + d.youtube.length > 0);
}
