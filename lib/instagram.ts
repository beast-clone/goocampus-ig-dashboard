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

function loadFromFile(): IGAccountConfig[] {
  try {
    const file = path.join(process.cwd(), "accounts.local.json");
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw) as StoredAccount[];
    return data.map((a) => ({
      id: a.igUsername,
      label: a.pageName,
      handle: `@${a.igUsername}`,
      igUserId: a.igUserId,
      pageAccessToken: a.pageAccessToken,
    }));
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
  const fromFile = loadFromFile();
  cached = fromFile.length ? fromFile : loadFromEnv();
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
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
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
};

export async function fetchRecentMedia(acc: IGAccountConfig, limit = 25) {
  const data = await gget<{ data: IGMedia[] }>(`${acc.igUserId}/media`, {
    fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
    limit: String(limit),
    access_token: acc.pageAccessToken,
  });
  return data.data;
}

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
