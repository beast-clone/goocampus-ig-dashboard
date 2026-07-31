// LinkedIn Community Management API client.
//
// Powers the live side of /api/linkedin. Auth is a member (org-admin) access
// token generated from the "GC World Pages API" app (Client ID 86a1luhoymqmmy),
// which holds the Community Management API product (Development Tier).
//
// Env (all optional — absence just keeps the tab on demo data):
//   LINKEDIN_ACCESS_TOKEN     — 2-month member token, scopes:
//                               r_organization_social, r_organization_followers, rw_organization_admin
//   LINKEDIN_REFRESH_TOKEN    — 1-year refresh token (used to mint a new access token)
//   LINKEDIN_CLIENT_ID        — 86a1luhoymqmmy
//   LINKEDIN_CLIENT_SECRET    — app primary client secret (only needed for refresh)
//   LINKEDIN_ORG_URN_GCWORLD  — urn:li:organization:XXXX for GooCampus World
//                               (auto-discovered on first call if left blank)
//
// All REST calls use the versioned API. Bump LINKEDIN_VERSION quarterly.

import fs from "fs";
import path from "path";
import { recordApiCall } from "./api-usage";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { getIntegrationToken } from "./integration-tokens";

const REST = "https://api.linkedin.com/rest";
// LinkedIn versions expire ~yearly; an inactive version 426s EVERY call → the whole
// tab silently drops to demo. Keep this current (env-overridable so it can be bumped
// without a deploy). 202506 was inactive; 202607 is the newest active for this app.
const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION || "202607";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

// Reads the token via getIntegrationToken("linkedin") so a token rotated through the
// Diagnostics "Reconnect" flow takes effect live (no redeploy); falls back to the env var.
export async function linkedinToken(): Promise<string | null> {
  return getIntegrationToken("linkedin");
}

async function liGet(path: string, token: string): Promise<any> {
  const r = await fetchWithTimeout(`${REST}${path}`, { headers: headers(token), cache: "no-store" });
  recordApiCall("LinkedIn", r.ok, r.status);
  const text = await r.text();
  if (!r.ok) throw new Error(`LinkedIn ${r.status} on ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// Which organization does this member administer? Returns the first APPROVED admin org URN.
// Cached in-process so we don't re-discover on every request.
let cachedOrgUrn: string | null = null;
export async function discoverOrgUrn(token: string): Promise<string> {
  if (process.env.LINKEDIN_ORG_URN_GCWORLD) return process.env.LINKEDIN_ORG_URN_GCWORLD;
  if (cachedOrgUrn) return cachedOrgUrn;

  // Try progressively looser queries — role/state names vary and some tokens
  // are page admins without the strict ADMINISTRATOR+APPROVED combo.
  const queries = [
    `/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
    `/organizationAcls?q=roleAssignee&state=APPROVED`,
    `/organizationAcls?q=roleAssignee`,
  ];
  let lastRaw = "";
  for (const q of queries) {
    try {
      const data = await liGet(q, token);
      const els = data.elements || [];
      lastRaw = JSON.stringify(data).slice(0, 400);
      // Field name varies by version (organizationalTarget / organization / ~target).
      // Just pull the first org URN out of each element by pattern.
      let urn: string | undefined;
      for (const e of els) {
        const m = JSON.stringify(e).match(/urn:li:organization:\d+/);
        if (m) { urn = m[0]; break; }
      }
      if (urn) { cachedOrgUrn = urn; return urn; }
    } catch (e) {
      lastRaw = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`No admin organization found. Last response: ${lastRaw}`);
}

// Public-page identity per key (name/handle used in the returned payload).
const PAGE_META: Record<string, { name: string; handle: string; vanityName: string }> = {
  gcworld:   { name: "GooCampus World", handle: "GooCampus World", vanityName: "goocampusworld" },
  goocampus: { name: "GooCampus",       handle: "GooCampus",       vanityName: "goocampus" },
};

// Resolve the org URN for a page. Each page has its own env var; falls back to
// auto-discovery of the first org the member administers.
//   gcworld   → LINKEDIN_ORG_URN_GCWORLD   (urn:li:organization:107157863)
//   goocampus → LINKEDIN_ORG_URN_GOOCAMPUS (urn:li:organization:3358713 — GooCampus Edu Solutions)
async function orgUrnFor(pageKey: string, token: string): Promise<string> {
  const env = pageKey === "goocampus" ? process.env.LINKEDIN_ORG_URN_GOOCAMPUS : process.env.LINKEDIN_ORG_URN_GCWORLD;
  if (env) return env;
  return discoverOrgUrn(token);
}

function ms(dateIso: string): number {
  return new Date(dateIso + "T00:00:00Z").getTime();
}

// List every organization this member administers (id + friendly name).
// Used to check whether the token can also reach the main GooCampus page.
export async function listAdminedOrgs(token: string): Promise<{ urn: string; name: string }[]> {
  const data = await liGet(`/organizationAcls?q=roleAssignee`, token);
  const urns: string[] = [];
  for (const e of data.elements || []) {
    const m = JSON.stringify(e).match(/urn:li:organization:\d+/);
    if (m) urns.push(m[0]);
  }
  const uniq = [...new Set(urns)];
  // Resolve names via /organizations/{id}
  const out = await Promise.all(uniq.map(async (urn) => {
    const id = urn.split(":").pop();
    try {
      const org = await liGet(`/organizations/${id}`, token);
      const name = org?.localizedName || org?.name?.localized?.en_US || org?.vanityName || id;
      return { urn, name: String(name) };
    } catch {
      return { urn, name: String(id) };
    }
  }));
  return out;
}

// Current total follower count. Enum casing changed across versions, so try both.
async function fetchCurrentFollowers(token: string, orgUrn: string): Promise<number> {
  const enc = encodeURIComponent(orgUrn);
  for (const edge of ["COMPANY_FOLLOWED_BY_MEMBER", "CompanyFollowedByMember"]) {
    try {
      const data = await liGet(`/networkSizes/${enc}?edgeType=${edge}`, token);
      const n = Number(data.firstDegreeSize || 0);
      if (n > 0) return n;
    } catch { /* try next casing */ }
  }
  // Fallback: networkSizes rejects the param on newer API versions — sum the LIFETIME
  // follower statistics segments (organic + paid) for the real total instead.
  try {
    const data = await liGet(`/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${enc}`, token);
    const seg = data.elements?.[0]?.followerCountsByAssociationType || [];
    const total = seg.reduce((s: number, r: any) =>
      s + (r.followerCounts?.organicFollowerCount || 0) + (r.followerCounts?.paidFollowerCount || 0), 0);
    if (total > 0) return total;
  } catch { /* leave at 0 — growth chart anchors on gains */ }
  return 0;
}

// Daily follower gains → reconstruct a running total ending at `currentFollowers`.
async function fetchFollowerTimeSeries(token: string, orgUrn: string, from: string, to: string, currentFollowers: number) {
  const enc = encodeURIComponent(orgUrn);
  const q = `/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${enc}` +
    `&timeIntervals=(timeRange:(start:${ms(from)},end:${ms(to)}),timeGranularityType:DAY)`;
  const data = await liGet(q, token);
  const rows = (data.elements || []).map((e: any) => {
    const start = e.timeRange?.start ?? 0;
    const organic = e.followerGains?.organicFollowerGain ?? 0;
    const paid = e.followerGains?.paidFollowerGain ?? 0;
    return { start, organic, paid, gain: organic + paid };
  }).sort((a: any, b: any) => a.start - b.start);

  // Walk backwards from the current total to fill each day's running followers.
  const totalGain = rows.reduce((s: number, r: any) => s + r.gain, 0);
  const organicGain = rows.reduce((s: number, r: any) => s + r.organic, 0);
  const paidGain = rows.reduce((s: number, r: any) => s + r.paid, 0);
  let running = currentFollowers - totalGain;
  const followersOverTime = rows.map((r: any) => {
    running += r.gain;
    return { date: new Date(r.start).toISOString().slice(0, 10), followers: running, newFollowers: r.gain, organic: r.organic, paid: r.paid };
  });
  return { followersOverTime, totalGain, organicGain, paidGain };
}

const PCT = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

// Static label tables for LinkedIn's fixed demographic enums.
const SENIORITY_LABELS: Record<string, string> = {
  "1": "Unpaid", "2": "Training", "3": "Entry", "4": "Senior", "5": "Manager",
  "6": "Director", "7": "VP", "8": "CXO", "9": "Partner", "10": "Owner",
};
const FUNCTION_LABELS: Record<string, string> = {
  "1": "Accounting", "2": "Administrative", "3": "Arts & Design", "4": "Business Development",
  "5": "Community & Social Services", "6": "Consulting", "7": "Education", "8": "Engineering",
  "9": "Entrepreneurship", "10": "Finance", "11": "Healthcare Services", "12": "Human Resources",
  "13": "Information Technology", "14": "Legal", "15": "Marketing", "16": "Media & Communication",
  "17": "Military & Protective", "18": "Operations", "19": "Product Management",
  "20": "Program & Project Mgmt", "21": "Purchasing", "22": "Quality Assurance",
  "23": "Real Estate", "24": "Research", "25": "Sales", "26": "Support",
};
const STAFF_SIZE_LABELS: Record<string, string> = {
  SIZE_1: "1", SIZE_2_TO_10: "2–10", SIZE_11_TO_50: "11–50", SIZE_51_TO_200: "51–200",
  SIZE_201_TO_500: "201–500", SIZE_501_TO_1000: "501–1,000", SIZE_1001_TO_5000: "1,001–5,000",
  SIZE_5001_TO_10000: "5,001–10,000", SIZE_10001_OR_MORE: "10,001+",
};

// Turn a raw enum/URN value into a friendly label using a static table; falls back to the tail of the URN.
function label(raw: string, table: Record<string, string>): string {
  const id = String(raw).split(":").pop() || raw; // urn:li:seniority:4 → "4"
  return table[id] || table[raw] || raw;
}

// LinkedIn taxonomy (industry / geo / region) is a FIXED reference list — a URN
// always maps to the same name — so we resolve each URN at most once per server
// lifetime and reuse it across every build. This is what keeps us under the
// industries-BATCH_GET 2-calls/day quota: without it, every follower-demographics
// build re-hit /industries (once per date range viewed) and breached the limit.
// In-memory is enough: a restart costs one fetch, nowhere near 2/day.
// Resolved taxonomy names are persisted to disk so that once /industries (etc.)
// succeeds even once, the names survive restarts and the endpoint is NEVER hit
// again — the hard guarantee against the 2/day industries quota.
const TAX_FILE = path.join(process.cwd(), ".data", "li-taxonomy.json");
function loadTaxonomy(): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(TAX_FILE, "utf8")) as Record<string, string>));
  } catch {
    return new Map();
  }
}
function saveTaxonomy() {
  try {
    fs.mkdirSync(path.dirname(TAX_FILE), { recursive: true });
    fs.writeFileSync(TAX_FILE, JSON.stringify(Object.fromEntries(taxonomyCache)));
  } catch {
    /* read-only fs — in-memory only */
  }
}
const taxonomyCache = loadTaxonomy();
// Last UTC day we ATTEMPTED to resolve each taxonomy type (industry/geo/region).
// industries-BATCH_GET is only 2 calls/day, so we spend at most one attempt per
// type per day even if it fails — never hammer a breached endpoint. Resets with
// LinkedIn's own 00:00 UTC quota reset, so it self-heals once quota frees up.
const taxonomyTriedOn = new Map<string, string>();
const utcDay = () => new Date().toISOString().slice(0, 10);

// Batch-resolve LinkedIn taxonomy URNs (industry, geo/region) to human names.
// Returns a map { rawUrn: friendlyName }. Any failure just yields an empty map,
// so callers fall back to the raw code — never a wrong label.
async function resolveNames(token: string, urns: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // Serve everything we already know; only hit LinkedIn for genuinely-new URNs.
  const missing: string[] = [];
  for (const u of urns) {
    const known = taxonomyCache.get(u);
    if (known !== undefined) out[u] = known;
    else missing.push(u);
  }
  if (missing.length === 0) return out; // fully cached → no LinkedIn call at all

  const byType: Record<string, { path: string; ids: string[] }> = {};
  for (const u of missing) {
    const parts = String(u).split(":"); // urn:li:industry:14
    const type = parts[2], id = parts[3];
    if (!type || !id) continue;
    const path = type === "industry" ? "/industries" : type === "geo" ? "/geo" : type === "region" ? "/regions" : "";
    if (!path) continue;
    (byType[type] ||= { path, ids: [] }).ids.push(id);
  }
  await Promise.all(Object.entries(byType).map(async ([type, { path, ids }]) => {
    // Spend at most one resolution attempt per type per UTC day (protects the
    // 2/day industries quota). Marked before the call so a failure won't retry.
    if (taxonomyTriedOn.get(type) === utcDay()) return;
    taxonomyTriedOn.set(type, utcDay());
    try {
      const list = `List(${[...new Set(ids)].join(",")})`;
      const data = await liGet(`${path}?ids=${encodeURIComponent(list)}`, token);
      const results = data.results || data.elements || {};
      let added = false;
      for (const [id, val] of Object.entries<any>(results)) {
        const name = val?.name?.localized?.en_US || val?.name?.value || val?.defaultLocalizedName?.value || val?.name;
        if (name) {
          const urn = `urn:li:${type}:${id}`;
          out[urn] = String(name);
          taxonomyCache.set(urn, String(name)); // remember permanently
          added = true;
        }
      }
      if (added) saveTaxonomy(); // durable — never fetch these URNs again
    } catch { /* leave codes */ }
  }));
  return out;
}

// Lifetime follower demographics (by seniority, function, industry, region, company size).
async function fetchFollowerDemographics(token: string, orgUrn: string) {
  const enc = encodeURIComponent(orgUrn);
  const data = await liGet(`/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${enc}`, token);
  const el = (data.elements || [])[0] || {};

  const sum = (arr: any[]) => (arr || []).reduce((s, x) => s + (x.followerCounts?.organicFollowerCount || 0) + (x.followerCounts?.paidFollowerCount || 0), 0);
  const mapBucket = (arr: any[], labelKey: string, table?: Record<string, string>) => {
    const total = sum(arr);
    return (arr || [])
      .map((x) => {
        const count = (x.followerCounts?.organicFollowerCount || 0) + (x.followerCounts?.paidFollowerCount || 0);
        const raw = String(x[labelKey] ?? "Unknown");
        return { label: table ? label(raw, table) : raw, pct: PCT(count, total), count };
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);
  };

  // Seniority, function, and company-size use fixed enums we can label statically.
  // Industry and region are large dynamic sets — shown as codes for now (a follow-up
  // can resolve them via LinkedIn's standardized-data APIs).
  const industry = mapBucket(el.followerCountsByIndustry, "industry");
  const location = mapBucket(el.followerCountsByRegion, "region");

  // Resolve the dynamic industry/region codes to names via the taxonomy API,
  // then tidy any that didn't resolve (urn:li:industry:14 → "Industry 14").
  const codes = [...industry, ...location].map((r) => r.label).filter((l) => l.startsWith("urn:li:"));
  const names = codes.length ? await resolveNames(token, codes).catch(() => ({} as Record<string, string>)) : {};
  const tidy = (raw: string) => {
    if (names[raw]) return names[raw];
    const m = raw.match(/^urn:li:(\w+):(\w+)$/);
    if (!m) return raw;
    const kind = m[1] === "geo" || m[1] === "region" ? "Region" : m[1][0].toUpperCase() + m[1].slice(1);
    return `${kind} ${m[2]}`;
  };
  for (const r of industry) r.label = tidy(r.label);
  for (const r of location) r.label = tidy(r.label);

  return {
    seniority:   mapBucket(el.followerCountsBySeniority, "seniority", SENIORITY_LABELS),
    jobFunction: mapBucket(el.followerCountsByFunction, "function", FUNCTION_LABELS),
    industry,
    location,
    companySize: mapBucket(el.followerCountsByStaffCountRange, "staffCountRange", STAFF_SIZE_LABELS),
  };
}

// Aggregate share statistics over the range (impressions, clicks, engagement).
async function fetchShareStats(token: string, orgUrn: string, from: string, to: string) {
  const enc = encodeURIComponent(orgUrn);
  const q = `/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc}` +
    `&timeIntervals=(timeRange:(start:${ms(from)},end:${ms(to)}),timeGranularityType:DAY)`;
  const data = await liGet(q, token);
  let impressions = 0, uniqueImpressions = 0, clicks = 0, likes = 0, comments = 0, shares = 0, engagementSum = 0, n = 0;
  for (const e of data.elements || []) {
    const s = e.totalShareStatistics || {};
    impressions += s.impressionCount || 0;
    uniqueImpressions += s.uniqueImpressionsCount || 0;
    clicks += s.clickCount || 0;
    likes += s.likeCount || 0;
    comments += s.commentCount || 0;
    shares += s.shareCount || 0;
    if (typeof s.engagement === "number") { engagementSum += s.engagement; n++; }
  }
  const engagementRate = n ? Math.round((engagementSum / n) * 1000) / 10 : (impressions ? Math.round(((clicks + likes + comments + shares) / impressions) * 1000) / 10 : 0);
  const ctr = impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0;
  return { impressions, uniqueImpressions, clicks, likes, comments, shares, engagementRate, ctr };
}

// ── Real posts with per-post statistics ─────────────────────────────────────
// Pulls the org's recent posts (text + media), then their individual share
// statistics, so the Post-performance grid shows actual LinkedIn posts. Entirely
// best-effort: any failure returns [] and the route falls back to demo posts.
type LivePost = {
  id: string; date: string; text: string; type: string; permalink: string | null;
  thumbnailUrl: string | null; docUrl: string | null; mediaTitle: string | null;
  impressions: number; uniqueImpressions: number; clicks: number; reactions: number; comments: number; shares: number;
  engagementRate: number; ctr: number;
};

function postMediaType(content: any): { type: string; mediaUrn: string | null; articleThumb: string | null } {
  const c = content || {};
  if (c.article) return { type: "ARTICLE", mediaUrn: null, articleThumb: c.article.thumbnail || c.article.thumbnailUrl || null };
  if (c.multiImage) {
    const first = (c.multiImage.images || [])[0];
    return { type: "IMAGE", mediaUrn: first?.id || first?.image || null, articleThumb: null };
  }
  if (c.media) {
    const id: string = c.media.id || c.media.media || "";
    const type = id.includes(":video:") ? "VIDEO" : id.includes(":document:") ? "DOCUMENT" : "IMAGE";
    return { type, mediaUrn: id || null, articleThumb: null };
  }
  return { type: "TEXT", mediaUrn: null, articleThumb: null };
}

// Which REST collection resolves a given asset URN.
function assetKind(urn: string): "videos" | "images" | "documents" {
  if (urn.includes(":video:")) return "videos";
  if (urn.includes(":document:")) return "documents";
  return "images";
}

// Resolve an asset URN to displayable URLs (best-effort).
//   imageUrl — an <img>-able picture: video poster thumbnail, or a single image.
//   fileUrl  — the raw asset (document PDF / video mp4) for an embed or download link.
// Documents (carousels) have NO cover image via the API — only a PDF fileUrl.
async function resolveAsset(token: string, urn: string): Promise<{ imageUrl: string | null; fileUrl: string | null }> {
  const https = (v: any) => (typeof v === "string" && /^https?:\/\//.test(v) ? v : null);
  try {
    const kind = assetKind(urn);
    const data = await liGet(`/${kind}/${encodeURIComponent(urn)}`, token);
    if (kind === "videos") return { imageUrl: https(data.thumbnail), fileUrl: https(data.downloadUrl) };
    if (kind === "documents") return { imageUrl: null, fileUrl: https(data.downloadUrl) };
    return { imageUrl: https(data.downloadUrl) || https(data.thumbnail), fileUrl: https(data.downloadUrl) };
  } catch { return { imageUrl: null, fileUrl: null }; }
}

async function fetchPosts(token: string, orgUrn: string): Promise<LivePost[]> {
  const enc = encodeURIComponent(orgUrn);
  const postsData = await liGet(`/posts?q=author&author=${enc}&count=25&sortBy=LAST_MODIFIED`, token);
  const els: any[] = postsData.elements || [];
  if (!els.length) return [];

  const shareUrns: string[] = [];
  const ugcUrns: string[] = [];
  const meta: Record<string, { id: string; text: string; type: string; date: string; mediaUrn: string | null; articleThumb: string | null; title: string | null; permalink: string | null }> = {};
  for (const e of els) {
    const id: string = e.id || e.urn || "";
    if (!id) continue;
    if (e.lifecycleState && e.lifecycleState !== "PUBLISHED") continue;
    const text: string = e.commentary || e.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "";
    const { type, mediaUrn, articleThumb } = postMediaType(e.content);
    const createdMs = e.createdAt || e.firstPublishedAt || e.publishedAt || 0;
    meta[id] = {
      id, text, type,
      date: createdMs ? new Date(createdMs).toISOString().slice(0, 10) : "",
      mediaUrn, articleThumb,
      title: e.content?.media?.title || e.content?.article?.title || null,
      permalink: (id.includes(":share:") || id.includes(":ugcPost:")) ? `https://www.linkedin.com/feed/update/${id}` : null,
    };
    if (id.includes(":ugcPost:")) ugcUrns.push(id);
    else shareUrns.push(id); // shares + any other treated as share
  }

  // Per-post statistics — batched by URN kind.
  const stats: Record<string, any> = {};
  async function pull(kind: "shares" | "ugcPosts", urns: string[]) {
    if (!urns.length) return;
    for (let i = 0; i < urns.length; i += 20) {
      const batch = urns.slice(i, i + 20);
      const list = `List(${batch.map((u) => encodeURIComponent(u)).join(",")})`;
      const data = await liGet(`/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${enc}&${kind}=${list}`, token).catch(() => ({} as any));
      for (const s of data.elements || []) {
        const key = s.share || s.ugcPost || "";
        if (key) stats[key] = s.totalShareStatistics || {};
      }
    }
  }
  await Promise.all([pull("shares", shareUrns), pull("ugcPosts", ugcUrns)]);

  // Resolve assets for all media posts we fetched (bounded to the ~25-post page).
  const withMedia = Object.values(meta).filter((m) => m.mediaUrn).slice(0, 30);
  const assetById: Record<string, { imageUrl: string | null; fileUrl: string | null }> = {};
  await Promise.all(withMedia.map(async (m) => { assetById[m.id] = await resolveAsset(token, m.mediaUrn as string); }));

  const posts: LivePost[] = Object.values(meta).map((m) => {
    const s = stats[m.id] || {};
    const impressions = s.impressionCount || 0;
    const uniqueImpressions = s.uniqueImpressionsCount || 0;
    const clicks = s.clickCount || 0;
    const reactions = s.likeCount || 0;
    const comments = s.commentCount || 0;
    const shares = s.shareCount || 0;
    const eng = typeof s.engagement === "number" ? Math.round(s.engagement * 1000) / 10
      : (impressions ? Math.round(((clicks + reactions + comments + shares) / impressions) * 1000) / 10 : 0);
    const asset = assetById[m.id] || { imageUrl: null, fileUrl: null };
    // Only real http(s) URLs reach the UI — a raw asset URN would break an <img>.
    const articleThumb = m.articleThumb && /^https?:\/\//.test(m.articleThumb) ? m.articleThumb : null;
    return {
      id: m.id, date: m.date, text: m.text, type: m.type, permalink: m.permalink,
      thumbnailUrl: asset.imageUrl || articleThumb,   // video poster / single image
      docUrl: asset.fileUrl,                            // carousel PDF / video mp4
      mediaTitle: m.title,
      impressions, uniqueImpressions, clicks, reactions, comments, shares,
      engagementRate: eng,
      ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0,
    };
  })
    // Keep posts that actually have some reach; sort best-first.
    .filter((p) => p.impressions > 0 || p.text)
    .sort((a, b) => b.impressions - a.impressions);

  return posts;
}

// Page statistics (views by section).
async function fetchPageStats(token: string, orgUrn: string) {
  const enc = encodeURIComponent(orgUrn);
  const data = await liGet(`/organizationPageStatistics?q=organization&organization=${enc}`, token);
  const el = (data.elements || [])[0] || {};
  const byType = el.pageStatisticsByPageType || {};
  const views: { page: string; views: number }[] = [];
  let total = 0;
  const LABELS: Record<string, string> = {
    overviewPageViews: "Overview", aboutPageViews: "About", jobsPageViews: "Jobs",
    lifeAtPageViews: "Life", peoplePageViews: "People", productsPageViews: "Products",
  };
  for (const [k, label] of Object.entries(LABELS)) {
    const v = byType[k]?.pageViews || byType[k]?.uniquePageViews || 0;
    if (v) { views.push({ page: label, views: v }); total += v; }
  }
  const all = el.totalPageStatistics?.views?.allPageViews?.pageViews || total;
  return { totalPageViews: all || total, byPage: views.sort((a, b) => b.views - a.views) };
}

export type LinkedInLive = Awaited<ReturnType<typeof buildLive>>;

export async function buildLive(pageKey: string, from: string, to: string) {
  const token = await linkedinToken();
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN not set");
  const meta = PAGE_META[pageKey];
  if (!meta) throw new Error("live not configured for this page");

  const orgUrn = await orgUrnFor(pageKey, token);
  const currentFollowers = await fetchCurrentFollowers(token, orgUrn);

  // Each section degrades independently: if one LinkedIn call fails we still return the rest.
  const [growth, demographics, shareStats, pageStats, posts] = await Promise.all([
    fetchFollowerTimeSeries(token, orgUrn, from, to, currentFollowers).catch(() => ({ followersOverTime: [], totalGain: 0, organicGain: 0, paidGain: 0 })),
    fetchFollowerDemographics(token, orgUrn).catch(() => ({ seniority: [], jobFunction: [], industry: [], location: [], companySize: [] })),
    fetchShareStats(token, orgUrn, from, to).catch(() => ({ impressions: 0, uniqueImpressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0, ctr: 0 })),
    fetchPageStats(token, orgUrn).catch(() => ({ totalPageViews: 0, byPage: [] as { page: string; views: number }[] })),
    fetchPosts(token, orgUrn).catch(() => [] as LivePost[]),
  ]);

  // LinkedIn's org-level share-statistics endpoint is flaky over short ranges for
  // small pages — when it returns 0 but we have real per-post stats, sum those.
  const postImpr = posts.reduce((s, p) => s + p.impressions, 0);
  const postUniq = posts.reduce((s, p) => s + p.uniqueImpressions, 0);
  const postClicks = posts.reduce((s, p) => s + p.clicks, 0);
  const impressions = shareStats.impressions || postImpr;
  const uniqueImpressions = shareStats.uniqueImpressions || postUniq;
  const ctr = shareStats.ctr || (impressions ? Math.round((postClicks / impressions) * 1000) / 10 : 0);

  return {
    page: { id: pageKey, name: meta.name, handle: meta.handle, vanityName: meta.vanityName, urn: orgUrn },
    source: "live" as const,
    range: { from, to },
    summary: {
      followers: currentFollowers,
      followerGain: growth.totalGain,
      organicGain: growth.organicGain,
      paidGain: growth.paidGain,
      impressions,
      uniqueImpressions,
      engagementRate: shareStats.engagementRate,
      ctr,
      pageViews: pageStats.totalPageViews,
      uniqueVisitors: Math.round(pageStats.totalPageViews * 0.7), // LinkedIn doesn't split unique on org page stats
      posts: posts.length,
    },
    followersOverTime: growth.followersOverTime,
    posts,
    visitors: {
      totalPageViews: pageStats.totalPageViews,
      uniqueVisitors: Math.round(pageStats.totalPageViews * 0.7),
      byPage: pageStats.byPage,
      overTime: growth.followersOverTime.map((d: { date: string }) => ({ date: d.date, views: 0, unique: 0 })),
    },
    demographics,
  };
}
