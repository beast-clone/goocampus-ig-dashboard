import { fetchWithTimeout } from "./fetch-with-timeout";
import { recordApiCall } from "./api-usage";
import { metaLimiter } from "./concurrency";
import fs from "fs";
import path from "path";

const GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type IGAccountConfig = {
  id: string;
  label: string;
  handle: string;
  igUserId: string;
  pageAccessToken: string;
  pageId?: string;
};

type StoredAccount = {
  igUsername: string;
  igUserId: string;
  igFollowers?: number;
  igMedia?: number;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
};

let cached: IGAccountConfig[] | null = null;

function mapStored(data: StoredAccount[]): IGAccountConfig[] {
  return data.map((a) => ({
    id: a.igUsername,
    label: a.pageName,
    handle: `@${a.igUsername}`,
    igUserId: a.igUserId,
    pageAccessToken: a.pageAccessToken,
    pageId: a.pageId,
  }));
}

function loadFromEnvJson(): IGAccountConfig[] {
  const raw = process.env.ACCOUNTS_JSON;
  if (!raw) return [];
  try {
    return mapStored(JSON.parse(raw) as StoredAccount[]);
  } catch (err) {
    console.error("[accounts] ACCOUNTS_JSON env var is invalid JSON:", (err as Error).message);
    return [];
  }
}

function loadFromFile(): IGAccountConfig[] {
  try {
    const file = path.join(process.cwd(), "accounts.local.json");
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    return mapStored(JSON.parse(raw) as StoredAccount[]);
  } catch {
    return [];
  }
}

function loadFromEnv(): IGAccountConfig[] {
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_PAGE_ACCESS_TOKEN;
  const username = process.env.IG_USERNAME;
  if (!igUserId || !token || !username) return [];
  return [{ id: username, label: process.env.IG_PAGE_NAME || username, handle: `@${username}`, igUserId, pageAccessToken: token }];
}

export function getConfiguredAccounts(): IGAccountConfig[] {
  if (cached) return cached;
  // Priority: file (local dev) → ACCOUNTS_JSON env (production) → single-account env (fallback)
  const fromFile = loadFromFile();
  if (fromFile.length) { cached = fromFile; return cached; }
  const fromEnvJson = loadFromEnvJson();
  if (fromEnvJson.length) { cached = fromEnvJson; return cached; }
  cached = loadFromEnv();
  return cached;
}

const PREFERRED_DEFAULT = "goocampus";

export function getDefaultAccountId(): string {
  const accs = getConfiguredAccounts();
  return accs.find((a) => a.id === PREFERRED_DEFAULT)?.id ?? accs[0]?.id ?? "";
}

export function getAccount(accountId: string): IGAccountConfig | null {
  const accs = getConfiguredAccounts();
  if (!accs.length) return null;
  if (accountId === "all") return accs.find((a) => a.id === PREFERRED_DEFAULT) ?? accs[0];
  return accs.find((a) => a.id === accountId) ?? null;
}

async function gget<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await metaLimiter(() => fetchWithTimeout(`${GRAPH}/${path}?${qs}`, { cache: "no-store" }));
  recordApiCall("Instagram Graph", res.ok, res.status);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export async function fetchBasic(acc: IGAccountConfig) {
  return gget<{
    username: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
    biography: string;
    profile_picture_url: string;
    website?: string;
  }>(acc.igUserId, {
    fields: "username,followers_count,follows_count,media_count,biography,profile_picture_url,website",
    access_token: acc.pageAccessToken,
  });
}

// ----- Mentions / Tagged / Hashtag search (Discover tab) -----

export type DiscoverMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  owner?: { id: string };
  username?: string;
};

export async function fetchMentionedMedia(acc: IGAccountConfig, limit = 25): Promise<DiscoverMedia[]> {
  try {
    type R = { mentioned_media?: { data: DiscoverMedia[] } };
    const r = await gget<R>(acc.igUserId, {
      fields: `mentioned_media.limit(${limit}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,owner,username}`,
      access_token: acc.pageAccessToken,
    });
    return r.mentioned_media?.data ?? [];
  } catch {
    return [];
  }
}

export async function fetchTaggedMedia(acc: IGAccountConfig, limit = 25): Promise<DiscoverMedia[]> {
  try {
    type R = { tags?: { data: DiscoverMedia[] } };
    const r = await gget<R>(`${acc.igUserId}/tags`, {
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,owner,username",
      limit: String(limit),
      access_token: acc.pageAccessToken,
    });
    return r.tags?.data ?? [];
  } catch {
    // /tags endpoint sometimes returns under different shape; try the direct field shape
    try {
      const r2 = await gget<{ data: DiscoverMedia[] }>(`${acc.igUserId}/tags`, {
        fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,owner,username",
        limit: String(limit),
        access_token: acc.pageAccessToken,
      });
      return r2.data ?? [];
    } catch {
      return [];
    }
  }
}

export async function lookupHashtagId(acc: IGAccountConfig, hashtag: string): Promise<string | null> {
  const clean = hashtag.replace(/^#/, "").trim().toLowerCase();
  try {
    const r = await gget<{ data: { id: string }[] }>("ig_hashtag_search", {
      user_id: acc.igUserId,
      q: clean,
      access_token: acc.pageAccessToken,
    });
    return r.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function fetchHashtagTopMedia(acc: IGAccountConfig, hashtagId: string, limit = 12): Promise<DiscoverMedia[]> {
  try {
    const r = await gget<{ data: DiscoverMedia[] }>(`${hashtagId}/top_media`, {
      user_id: acc.igUserId,
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
      limit: String(limit),
      access_token: acc.pageAccessToken,
    });
    return r.data ?? [];
  } catch {
    return [];
  }
}

export async function fetchHashtagRecentMedia(acc: IGAccountConfig, hashtagId: string, limit = 12): Promise<DiscoverMedia[]> {
  try {
    const r = await gget<{ data: DiscoverMedia[] }>(`${hashtagId}/recent_media`, {
      user_id: acc.igUserId,
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
      limit: String(limit),
      access_token: acc.pageAccessToken,
    });
    return r.data ?? [];
  } catch {
    return [];
  }
}

export type CompetitorMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  children?: { data: { id: string; media_type: string; media_url?: string; thumbnail_url?: string }[] };
};

export type CompetitorSnapshot = {
  username: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  followers_count: number;
  follows_count?: number;
  media_count: number;
  recent: CompetitorMedia[];
  avgLikesRecent: number;
  avgCommentsRecent: number;
  engagementRatePct: number;
  postsLast30d: number;
};

export async function fetchCompetitor(acc: IGAccountConfig, username: string): Promise<CompetitorSnapshot> {
  const clean = username.replace(/^@/, "").trim();
  const fields = `business_discovery.username(${clean}){username,name,biography,profile_picture_url,followers_count,follows_count,media_count,media.limit(25){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{media_type,media_url,thumbnail_url}}}`;
  type R = {
    business_discovery?: {
      username: string;
      name?: string;
      biography?: string;
      profile_picture_url?: string;
      followers_count: number;
      follows_count?: number;
      media_count: number;
      media?: { data: CompetitorMedia[] };
    };
  };
  const res = await gget<R>(acc.igUserId, {
    fields,
    access_token: acc.pageAccessToken,
  });
  const bd = res.business_discovery;
  if (!bd) {
    throw new Error(`No business_discovery data for @${clean} (must be a public Business or Creator account)`);
  }
  const recent = bd.media?.data ?? [];
  const totalLikes = recent.reduce((s, m) => s + (m.like_count || 0), 0);
  const totalComments = recent.reduce((s, m) => s + (m.comments_count || 0), 0);
  const avgLikes = recent.length ? Math.round(totalLikes / recent.length) : 0;
  const avgComments = recent.length ? Math.round(totalComments / recent.length) : 0;
  const erPct = bd.followers_count > 0 && recent.length > 0
    ? ((avgLikes + avgComments) / bd.followers_count) * 100
    : 0;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const postsLast30d = recent.filter((m) => new Date(m.timestamp).getTime() >= cutoff).length;
  return {
    username: bd.username,
    name: bd.name,
    biography: bd.biography,
    profile_picture_url: bd.profile_picture_url,
    followers_count: bd.followers_count,
    follows_count: bd.follows_count,
    media_count: bd.media_count,
    recent,
    avgLikesRecent: avgLikes,
    avgCommentsRecent: avgComments,
    engagementRatePct: erPct,
    postsLast30d,
  };
}

export type InsightDay = { end_time: string; value: number };
export type InsightMetric = { name: string; values: InsightDay[] };

export async function fetchAccountInsights(acc: IGAccountConfig, fromIsoDate: string, toIsoDate: string) {
  const since = Math.floor(new Date(fromIsoDate + "T00:00:00Z").getTime() / 1000);
  const until = Math.floor(new Date(toIsoDate + "T23:59:59Z").getTime() / 1000);
  const data = await gget<{ data: InsightMetric[] }>(`${acc.igUserId}/insights`, {
    metric: "reach,follower_count",
    period: "day",
    since: String(since),
    until: String(until),
    access_token: acc.pageAccessToken,
  });
  return data.data;
}

export type IGMedia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY";
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  children?: { data: { media_type?: string; media_url?: string; thumbnail_url?: string }[] };
};

export async function fetchRecentMedia(acc: IGAccountConfig, limit = 25) {
  const data = await gget<{ data: IGMedia[] }>(`${acc.igUserId}/media`, {
    fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
    access_token: acc.pageAccessToken,
  });
  return data.data;
}

// ----- Audience demographics -----

export type DemographicEntry = { label: string; value: number };
export type AudienceDemographics = {
  age: DemographicEntry[];
  gender: DemographicEntry[];
  cities: DemographicEntry[];
  countries: DemographicEntry[];
  ageGender: { age: string; M: number; F: number; U: number }[];
};
export type OnlineFollowers = { hour: number; value: number }[];
// 7 rows (weekday 0=Sun..6=Sat) × 24 cols (hour). null when no data for that cell.
export type OnlineFollowersGrid = (number | null)[][];

type BreakdownResult = {
  dimension_keys: string[];
  results: { dimension_values: string[]; value: number }[];
};

async function fetchBreakdown(acc: IGAccountConfig, metric: string, breakdown: string, timeframe?: string): Promise<BreakdownResult | null> {
  const params: Record<string, string> = {
    metric,
    period: "lifetime",
    metric_type: "total_value",
    breakdown,
    access_token: acc.pageAccessToken,
  };
  if (timeframe) params.timeframe = timeframe;
  try {
    const r = await gget<{ data: { total_value?: { breakdowns?: BreakdownResult[] } }[] }>(
      `${acc.igUserId}/insights`,
      params,
    );
    const bd = r.data?.[0]?.total_value?.breakdowns?.[0];
    return bd || null;
  } catch {
    return null;
  }
}

async function fetchOnlineFollowersRaw(
  acc: IGAccountConfig,
): Promise<{ avg: OnlineFollowers; grid: OnlineFollowersGrid }> {
  // online_followers uses the legacy since/until shape, not metric_type=total_value
  const until = Math.floor(Date.now() / 1000);
  const since = until - 7 * 24 * 60 * 60;
  const empty: OnlineFollowersGrid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => null as number | null),
  );
  try {
    const r = await gget<{ data: { values: { value: Record<string, number>; end_time: string }[] }[] }>(
      `${acc.igUserId}/insights`,
      {
        metric: "online_followers",
        period: "lifetime",
        since: String(since),
        until: String(until),
        access_token: acc.pageAccessToken,
      },
    );
    const days = r.data?.[0]?.values || [];
    const sumByHour = new Map<number, { sum: number; count: number }>();
    const grid: OnlineFollowersGrid = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => null as number | null),
    );
    for (const day of days) {
      const map = day.value || {};
      const keys = Object.keys(map);
      if (keys.length === 0) continue;
      // Normalise to Mon-first (0=Mon..6=Sun) to match DAY_LABELS / nextOccurrence
      // in scheduler-helpers.ts — getUTCDay() is Sun-first, and consuming it as-is
      // shifted every "best time to post" suggestion by the Sun/Mon offset.
      const js = new Date(day.end_time).getUTCDay(); // 0=Sun..6=Sat
      const weekday = js === 0 ? 6 : js - 1;
      for (const k of keys) {
        const hour = parseInt(k, 10);
        if (Number.isNaN(hour)) continue;
        const v = map[k] || 0;
        const slot = sumByHour.get(hour) || { sum: 0, count: 0 };
        slot.sum += v;
        slot.count += 1;
        sumByHour.set(hour, slot);
        grid[weekday][hour] = (grid[weekday][hour] ?? 0) + v;
      }
    }
    const avg = Array.from({ length: 24 }, (_, h) => {
      const slot = sumByHour.get(h);
      return { hour: h, value: slot ? Math.round(slot.sum / slot.count) : 0 };
    });
    return { avg, grid };
  } catch {
    return { avg: [], grid: empty };
  }
}

export async function fetchAudience(acc: IGAccountConfig): Promise<AudienceDemographics & { onlineFollowers: OnlineFollowers; onlineGrid: OnlineFollowersGrid; available: boolean; reason?: string }> {
  const [age, gender, cities, countries, ageGender, online] = await Promise.all([
    fetchBreakdown(acc, "follower_demographics", "age"),
    fetchBreakdown(acc, "follower_demographics", "gender"),
    fetchBreakdown(acc, "follower_demographics", "city"),
    fetchBreakdown(acc, "follower_demographics", "country"),
    fetchBreakdown(acc, "follower_demographics", "age,gender"),
    fetchOnlineFollowersRaw(acc),
  ]);

  const available = !!(age || gender || cities || countries);
  if (!available) {
    return {
      age: [], gender: [], cities: [], countries: [], ageGender: [],
      onlineFollowers: online.avg,
      onlineGrid: online.grid,
      available: false,
      reason: "Demographics need 100+ followers and Meta hasn't computed for this account.",
    };
  }

  const toEntries = (bd: BreakdownResult | null): DemographicEntry[] =>
    bd ? bd.results
      .map((r) => ({ label: r.dimension_values[0], value: r.value || 0 }))
      .sort((a, b) => b.value - a.value)
    : [];

  const ageGenderMatrix: { age: string; M: number; F: number; U: number }[] = [];
  if (ageGender) {
    const byAge = new Map<string, { M: number; F: number; U: number }>();
    for (const r of ageGender.results) {
      const [a, g] = r.dimension_values;
      if (!byAge.has(a)) byAge.set(a, { M: 0, F: 0, U: 0 });
      const slot = byAge.get(a)!;
      if (g === "M" || g === "male") slot.M += r.value || 0;
      else if (g === "F" || g === "female") slot.F += r.value || 0;
      else slot.U += r.value || 0;
    }
    for (const [a, v] of byAge) ageGenderMatrix.push({ age: a, ...v });
    ageGenderMatrix.sort((a, b) => a.age.localeCompare(b.age));
  }

  return {
    age: toEntries(age),
    gender: toEntries(gender),
    cities: toEntries(cities).slice(0, 10),
    countries: toEntries(countries).slice(0, 10),
    ageGender: ageGenderMatrix,
    onlineFollowers: online.avg,
    onlineGrid: online.grid,
    available: true,
  };
}

// ----- Media insights -----

export async function fetchMediaInsights(acc: IGAccountConfig, mediaId: string, mediaType: IGMedia["media_type"], mediaProductType?: IGMedia["media_product_type"]) {
  let metrics = "reach,saved,shares,total_interactions";
  if (mediaProductType === "REELS") {
    metrics = "reach,saved,shares,total_interactions,views,ig_reels_video_view_total_time,ig_reels_avg_watch_time";
  }
  try {
    const data = await gget<{ data: InsightMetric[] }>(`${mediaId}/insights`, {
      metric: metrics,
      access_token: acc.pageAccessToken,
    });
    return data.data;
  } catch {
    return [];
  }
}

// ----- Inbox: comments (works today) + DMs (needs instagram_manage_messages approval) -----

export type IGComment = {
  id: string;
  text?: string;
  username?: string;
  timestamp: string;
  like_count?: number;
  replies?: { data: { id: string; text?: string; username?: string; timestamp: string }[] };
};

export async function fetchMediaComments(acc: IGAccountConfig, mediaId: string, limit = 25): Promise<IGComment[]> {
  try {
    const r = await gget<{ data: IGComment[] }>(`${mediaId}/comments`, {
      fields: "id,text,username,timestamp,like_count,replies{id,text,username,timestamp}",
      limit: String(limit),
      access_token: acc.pageAccessToken,
    });
    return r.data ?? [];
  } catch {
    return [];
  }
}

export async function replyToComment(acc: IGAccountConfig, commentId: string, message: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(`${GRAPH}/${commentId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message, access_token: acc.pageAccessToken }),
    });
    const j = (await res.json()) as { error?: { message: string } };
    if (!res.ok || j.error) return { success: false, error: j.error?.message || `HTTP ${res.status}` };
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

// Returns false (with reason) until instagram_manage_messages is approved — UI uses this to show a "pending" state.
export async function checkDmCapability(acc: IGAccountConfig): Promise<{ available: boolean; reason?: string }> {
  try {
    const res = await fetchWithTimeout(`${GRAPH}/${acc.igUserId}/conversations?platform=instagram&access_token=${acc.pageAccessToken}`);
    const j = (await res.json()) as { error?: { message: string } };
    if (j.error) return { available: false, reason: j.error.message };
    return { available: true };
  } catch (e) {
    return { available: false, reason: (e as Error).message };
  }
}
