import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getAccount } from "@/lib/instagram";
import { fetchPostsInRange } from "@/lib/post-history";
import { fetchPagePosts } from "@/lib/facebook";
import { fetchOrgPosts, linkedinToken } from "@/lib/linkedin";
import { orgUrnFor } from "@/lib/linkedin-publish";
import { LI_PAGE } from "@/lib/brand-platforms";
import { accountIdForSbu, matchPost, type Candidate, type MatchPost, type MatchTask } from "@/lib/post-match";

// GET /api/marketing-hub/link-suggest?id=<mh_posts.id>
//
// "Which live posts is this task?" — reads only, never writes. The caller applies a
// result through the existing write-back seam (/api/scheduler/link-back), so there is
// still exactly ONE place that fills a link, stamps published_at and logs it.
//
// The dashboard's own publishers already call that seam. This is for everything else:
// the team publishes from the apps, so for those tasks nothing ever reported the link
// back and the fields stayed empty. Rather than ask them to paste links, this looks at
// the posts that are genuinely live and works out which one belongs to the task —
// separately for Instagram, Facebook and LinkedIn, because a task usually goes out on
// more than one and each has its own link to find.
//
// Per platform it returns `confident` only when the match is not in doubt. Otherwise
// it returns candidates for a person to choose from, because a wrong link is worse
// than a blank one: it looks right, so nobody re-checks it.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 26;

// How far either side of the publishing date to look. A post can slip a day or go out
// early; beyond this the text match is doing all the work anyway and the extra posts
// only add things to be confused with.
const WINDOW_DAYS = 3;

const shift = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

type PlatformResult = {
  alreadyLinked?: string;
  /** Why there is nothing to offer, when that is not a failure. */
  reason?: string;
  scanned: number;
  confident: Candidate | null;
  candidates: Candidate[];
};
const nothing = (reason: string): PlatformResult => ({ reason, scanned: 0, confident: null, candidates: [] });

function decide(task: MatchTask, posts: MatchPost[]): PlatformResult {
  const { confident, candidates } = matchPost(task, posts);
  return { scanned: posts.length, confident, candidates };
}

// Keep the window filter in one place: Facebook and LinkedIn both hand back "recent
// posts" with no date parameter, so the range has to be applied here.
function inWindow(iso: string | null | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(from + "T00:00:00").getTime() && t <= new Date(to + "T23:59:59").getTime();
}

export async function GET(req: Request) {
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { data: task, error } = await sb
      .from("mh_posts")
      .select("id, particulars, caption, publishing_date, sbu, instagram_url, facebook_url, linkedin_url")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    if (!task.publishing_date) {
      return NextResponse.json({ reason: "no-publishing-date", instagram: nothing("no-publishing-date"), facebook: nothing("no-publishing-date"), linkedin: nothing("no-publishing-date") });
    }
    const accountId = accountIdForSbu(task.sbu);
    // Samvaya and anything we don't post for. Not an error — there is genuinely no
    // account of ours this task could have gone out on.
    if (!accountId) {
      return NextResponse.json({ reason: "no-account-for-brand", instagram: nothing("no-account-for-brand"), facebook: nothing("no-account-for-brand"), linkedin: nothing("no-account-for-brand") });
    }

    const from = shift(task.publishing_date, -WINDOW_DAYS);
    const to = shift(task.publishing_date, WINDOW_DAYS);
    const mt: MatchTask = { particulars: task.particulars, caption: task.caption, publishing_date: task.publishing_date };
    const acc = getAccount(accountId);

    // All three at once — they are independent network calls and this route has a
    // budget to stay inside. allSettled so one platform being down or unconfigured
    // still lets the other two answer.
    const [ig, fb, li] = await Promise.allSettled([
      (async (): Promise<PlatformResult> => {
        if (task.instagram_url) return { alreadyLinked: task.instagram_url, scanned: 0, confident: null, candidates: [] };
        if (!acc) return nothing("account-not-configured");
        // Insights are per-post Meta calls and cost seconds each; matching only needs
        // the caption, the permalink and when it went out.
        const posts = await fetchPostsInRange(acc, from, to, { withInsights: false, cap: 60 });
        return decide(mt, posts.map((p) => ({ id: p.id, caption: p.caption, permalink: p.permalink, timestamp: p.timestamp })));
      })(),

      (async (): Promise<PlatformResult> => {
        if (task.facebook_url) return { alreadyLinked: task.facebook_url, scanned: 0, confident: null, candidates: [] };
        if (!acc) return nothing("account-not-configured");
        const res = await fetchPagePosts(acc, 60);
        if (!res.available) return nothing(res.reason || "facebook-unavailable");
        const posts = res.items
          .filter((p) => inWindow(p.createdTime, from, to))
          .map((p) => ({ id: p.id, caption: p.message, permalink: p.permalink, timestamp: p.createdTime }));
        return decide(mt, posts);
      })(),

      (async (): Promise<PlatformResult> => {
        if (task.linkedin_url) return { alreadyLinked: task.linkedin_url, scanned: 0, confident: null, candidates: [] };
        // Only two of the brands have a LinkedIn page at all (lib/brand-platforms).
        const pageKey = LI_PAGE[accountId];
        if (!pageKey) return nothing("brand-has-no-linkedin");
        const orgUrn = orgUrnFor(pageKey);
        if (!orgUrn) return nothing("linkedin-org-not-configured");
        const token = await linkedinToken();
        if (!token) return nothing("linkedin-not-connected");
        const posts = (await fetchOrgPosts(token, orgUrn))
          .filter((p) => inWindow(p.date, from, to))
          .map((p) => ({ id: p.id, caption: p.text, permalink: p.permalink, timestamp: p.date }));
        return decide(mt, posts);
      })(),
    ]);

    // A platform that threw says so rather than silently looking like "nothing found".
    const settle = (r: PromiseSettledResult<PlatformResult>): PlatformResult =>
      r.status === "fulfilled" ? r.value : nothing("lookup-failed");

    return NextResponse.json({
      accountId,
      window: { from, to },
      instagram: settle(ig),
      facebook: settle(fb),
      linkedin: settle(li),
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't look up the published post"), { status: 502 });
  }
}
