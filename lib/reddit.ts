// Reddit official API reader — app-only OAuth (client_credentials grant).
//
// Reddit walls ALL web/scrape reads (direct fetch, old.reddit, Jina proxy → 403
// "blocked by network security"). But the AUTHENTICATED API (oauth.reddit.com)
// returns public threads + comments fine. Free, no user login: register a
// "script" app at https://www.reddit.com/prefs/apps → set:
//   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
// Low-volume read use sits inside Reddit's free tier (100 queries/min).

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { cached } from "@/lib/api-cache";
import { recordApiCall } from "@/lib/api-usage";

const UA = "web:goocampus-marketing-radar:v1.0 (content radar)";

export function hasRedditAuth(): boolean {
  return !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

// Extract the base36 thread id from a Reddit URL (…/comments/<id>/…).
export function threadIdFromUrl(url: string): string | null {
  const m = url.match(/\/comments\/([a-z0-9]+)/i);
  return m ? m[1] : null;
}

let tokenCache: { token: string; exp: number } = { token: "", exp: 0 };
async function getToken(): Promise<string> {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64");
  const r = await fetchWithTimeout("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: "grant_type=client_credentials",
    timeoutMs: 10_000,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Reddit token ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return j.access_token;
}

export type RedditComment = { author: string; body: string; score: number; createdUtc: number };
export type RedditThread = {
  title: string;
  author: string;
  subreddit: string;
  selftext: string;
  score: number;
  numComments: number;
  comments: RedditComment[];
  permalink: string;
};

// Full public thread + top comments via the API. Cached 30m (Reddit rate limits;
// a thread barely changes minute-to-minute). Throws on non-thread URLs / API errors.
export async function fetchRedditThread(url: string, opts: { maxComments?: number } = {}): Promise<RedditThread> {
  const id = threadIdFromUrl(url);
  if (!id) throw new Error("Not a Reddit thread URL");
  const maxComments = opts.maxComments ?? 30;
  return cached(`reddit:${id}:${maxComments}`, 30 * 60_000, async () => {
    const token = await getToken();
    const r = await fetchWithTimeout(
      `https://oauth.reddit.com/comments/${id}?limit=${maxComments}&depth=2&sort=top&raw_json=1`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": UA }, timeoutMs: 12_000, cache: "no-store" },
    );
    recordApiCall("Reddit", r.ok, r.status);
    if (!r.ok) throw new Error(`Reddit thread ${r.status}`);
    const j = (await r.json()) as Array<{ data?: { children?: Array<{ kind: string; data: Record<string, unknown> }> } }>;
    const post = j[0]?.data?.children?.[0]?.data as Record<string, unknown> | undefined;
    const comments: RedditComment[] = (j[1]?.data?.children || [])
      .filter((c) => c.kind === "t1" && typeof c.data?.body === "string")
      .map((c) => ({
        author: String(c.data.author || "[deleted]"),
        body: String(c.data.body || ""),
        score: Number(c.data.score || 0),
        createdUtc: Number(c.data.created_utc || 0),
      }))
      .slice(0, maxComments);
    return {
      title: String(post?.title || ""),
      author: String(post?.author || ""),
      subreddit: String(post?.subreddit_name_prefixed || ""),
      selftext: String(post?.selftext || ""),
      score: Number(post?.ups ?? 0),
      numComments: Number(post?.num_comments ?? 0),
      comments,
      permalink: post?.permalink ? `https://www.reddit.com${post.permalink}` : url,
    };
  });
}
