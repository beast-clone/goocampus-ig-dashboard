import { getAccount } from "@/lib/instagram";
import { fetchPostsInRange } from "@/lib/post-history";
import { fetchPagePosts } from "@/lib/facebook";
import { fetchOrgPosts, linkedinToken } from "@/lib/linkedin";
import { orgUrnFor } from "@/lib/linkedin-publish";
import { LI_PAGE } from "@/lib/brand-platforms";
import type { MatchPost } from "@/lib/post-match";

// "What actually went live on this account between these dates", in the one shape the
// matcher understands. Used by BOTH the task modal's "find the published posts" and
// the nightly job — one code path, so the button and the job can never disagree about
// what is live or how a post reads.

export type LinkPlatform = "instagram" | "facebook" | "linkedin";

/** `reason` explains an EMPTY list that is not a failure — no page, not connected. */
export type PlatformPosts = { posts: MatchPost[]; reason?: string };
export type LivePosts = Record<LinkPlatform, PlatformPosts>;

const none = (reason: string): PlatformPosts => ({ posts: [], reason });

// Facebook and LinkedIn both hand back "recent posts" with no date parameter, so the
// range has to be applied here rather than asked for.
function inWindow(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(from + "T00:00:00").getTime() && t <= new Date(to + "T23:59:59").getTime();
}

export async function fetchLivePosts(accountId: string, from: string, to: string): Promise<LivePosts> {
  const acc = getAccount(accountId);

  // In parallel, and independently: one platform being down, unconfigured, or simply
  // not one this brand uses must still let the other two answer.
  const [ig, fb, li] = await Promise.allSettled([
    (async (): Promise<PlatformPosts> => {
      if (!acc) return none("account-not-configured");
      // Insights are per-post Meta calls and cost seconds each; matching only needs
      // the caption, the permalink and when it went out.
      const posts = await fetchPostsInRange(acc, from, to, { withInsights: false, cap: 100 });
      return { posts: posts.map((p) => ({ id: p.id, caption: p.caption, permalink: p.permalink, timestamp: p.timestamp })) };
    })(),

    (async (): Promise<PlatformPosts> => {
      if (!acc) return none("account-not-configured");
      const res = await fetchPagePosts(acc, 100);
      if (!res.available) return none(res.reason || "facebook-unavailable");
      return {
        posts: res.items
          .filter((p) => inWindow(p.createdTime, from, to))
          .map((p) => ({ id: p.id, caption: p.message, permalink: p.permalink, timestamp: p.createdTime })),
      };
    })(),

    (async (): Promise<PlatformPosts> => {
      // Only some brands have a LinkedIn page at all (lib/brand-platforms).
      const pageKey = LI_PAGE[accountId];
      if (!pageKey) return none("brand-has-no-linkedin");
      const orgUrn = orgUrnFor(pageKey);
      if (!orgUrn) return none("linkedin-org-not-configured");
      const token = await linkedinToken();
      if (!token) return none("linkedin-not-connected");
      return {
        posts: (await fetchOrgPosts(token, orgUrn))
          .filter((p) => inWindow(p.date, from, to))
          .map((p) => ({ id: p.id, caption: p.text, permalink: p.permalink, timestamp: p.date })),
      };
    })(),
  ]);

  // A platform that threw says so, rather than silently looking like "nothing found" —
  // the difference decides whether a person goes hunting for a post that exists.
  const settle = (r: PromiseSettledResult<PlatformPosts>): PlatformPosts =>
    r.status === "fulfilled" ? r.value : none("lookup-failed");

  return { instagram: settle(ig), facebook: settle(fb), linkedin: settle(li) };
}

/** Narrow an already-fetched pool to one task's own window — lets a single fetch per
 *  account serve many tasks, which is what makes the nightly job affordable. */
export function withinDays(posts: MatchPost[], centre: string, days: number): MatchPost[] {
  const c = new Date(centre + "T00:00:00").getTime();
  const span = days * 24 * 60 * 60 * 1000;
  return posts.filter((p) => p.timestamp && Math.abs(new Date(p.timestamp).getTime() - c) <= span);
}
