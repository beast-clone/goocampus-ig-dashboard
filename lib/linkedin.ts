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

const REST = "https://api.linkedin.com/rest";
const LINKEDIN_VERSION = "202506";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

export function linkedinToken(): string | null {
  return process.env.LINKEDIN_ACCESS_TOKEN || null;
}

async function liGet(path: string, token: string): Promise<any> {
  const r = await fetch(`${REST}${path}`, { headers: headers(token), cache: "no-store" });
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
      return Number(data.firstDegreeSize || 0);
    } catch { /* try next casing */ }
  }
  return 0; // unknown — growth chart will anchor at total gains instead
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
    return { start, gain: organic + paid };
  }).sort((a: any, b: any) => a.start - b.start);

  // Walk backwards from the current total to fill each day's running followers.
  const totalGain = rows.reduce((s: number, r: any) => s + r.gain, 0);
  let running = currentFollowers - totalGain;
  const followersOverTime = rows.map((r: any) => {
    running += r.gain;
    return { date: new Date(r.start).toISOString().slice(0, 10), followers: running, newFollowers: r.gain };
  });
  return { followersOverTime, totalGain };
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

// Batch-resolve LinkedIn taxonomy URNs (industry, geo/region) to human names.
// Returns a map { rawUrn: friendlyName }. Any failure just yields an empty map,
// so callers fall back to the raw code — never a wrong label.
async function resolveNames(token: string, urns: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const byType: Record<string, { path: string; ids: string[] }> = {};
  for (const u of urns) {
    const parts = String(u).split(":"); // urn:li:industry:14
    const type = parts[2], id = parts[3];
    if (!type || !id) continue;
    const path = type === "industry" ? "/industries" : type === "geo" ? "/geo" : type === "region" ? "/regions" : "";
    if (!path) continue;
    (byType[type] ||= { path, ids: [] }).ids.push(id);
  }
  await Promise.all(Object.entries(byType).map(async ([type, { path, ids }]) => {
    try {
      const list = `List(${[...new Set(ids)].join(",")})`;
      const data = await liGet(`${path}?ids=${encodeURIComponent(list)}`, token);
      const results = data.results || data.elements || {};
      for (const [id, val] of Object.entries<any>(results)) {
        const name = val?.name?.localized?.en_US || val?.name?.value || val?.defaultLocalizedName?.value || val?.name;
        if (name) out[`urn:li:${type}:${id}`] = String(name);
      }
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
  let impressions = 0, clicks = 0, likes = 0, comments = 0, shares = 0, engagementSum = 0, n = 0;
  for (const e of data.elements || []) {
    const s = e.totalShareStatistics || {};
    impressions += s.impressionCount || 0;
    clicks += s.clickCount || 0;
    likes += s.likeCount || 0;
    comments += s.commentCount || 0;
    shares += s.shareCount || 0;
    if (typeof s.engagement === "number") { engagementSum += s.engagement; n++; }
  }
  const engagementRate = n ? Math.round((engagementSum / n) * 1000) / 10 : (impressions ? Math.round(((clicks + likes + comments + shares) / impressions) * 1000) / 10 : 0);
  return { impressions, clicks, likes, comments, shares, engagementRate };
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
  const token = linkedinToken();
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN not set");
  // Only GooCampus World is wired live (that's the approved org). Main GooCampus stays demo.
  if (pageKey !== "gcworld") throw new Error("live not configured for this page");

  const orgUrn = await discoverOrgUrn(token);
  const currentFollowers = await fetchCurrentFollowers(token, orgUrn);

  // Each section degrades independently: if one LinkedIn call fails we still return the rest.
  const [growth, demographics, shareStats, pageStats] = await Promise.all([
    fetchFollowerTimeSeries(token, orgUrn, from, to, currentFollowers).catch(() => ({ followersOverTime: [], totalGain: 0 })),
    fetchFollowerDemographics(token, orgUrn).catch(() => ({ seniority: [], jobFunction: [], industry: [], location: [], companySize: [] })),
    fetchShareStats(token, orgUrn, from, to).catch(() => ({ impressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0 })),
    fetchPageStats(token, orgUrn).catch(() => ({ totalPageViews: 0, byPage: [] as { page: string; views: number }[] })),
  ]);

  return {
    page: { id: "gcworld", name: "GooCampus World", handle: "GooCampus World", vanityName: "goocampusworld", urn: orgUrn },
    source: "live" as const,
    range: { from, to },
    summary: {
      followers: currentFollowers,
      followerGain: growth.totalGain,
      impressions: shareStats.impressions,
      engagementRate: shareStats.engagementRate,
      pageViews: pageStats.totalPageViews,
      uniqueVisitors: Math.round(pageStats.totalPageViews * 0.7), // LinkedIn doesn't split unique on org page stats
      posts: 0,
    },
    followersOverTime: growth.followersOverTime,
    posts: [] as unknown[], // per-post live stats are a follow-up (needs /posts + ugcPost stats)
    visitors: {
      totalPageViews: pageStats.totalPageViews,
      uniqueVisitors: Math.round(pageStats.totalPageViews * 0.7),
      byPage: pageStats.byPage,
      overTime: growth.followersOverTime.map((d) => ({ date: d.date, views: 0, unique: 0 })),
    },
    demographics,
  };
}
