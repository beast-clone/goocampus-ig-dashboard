import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { getAccount } from "@/lib/instagram";
import { fetchPostsInRange } from "@/lib/post-history";
import { accountIdForSbu, matchPost } from "@/lib/post-match";

// GET /api/marketing-hub/link-suggest?id=<mh_posts.id>
//
// "Which live post is this task?" — reads only, never writes. The caller applies a
// result through the existing write-back seam (/api/scheduler/link-back), so there is
// still exactly ONE place that fills a link, stamps published_at and logs it.
//
// The dashboard's own publishers already call that seam. This is for everything else:
// the team publishes from Instagram itself, so for those tasks nothing ever reported
// the link back and the field stayed empty. Rather than ask them to paste links, this
// looks at the posts that are actually live — the same feed the Publishing Calendar
// draws — and works out which one belongs to the task.
//
// Returns { confident } only when the match is not in doubt. Otherwise it returns
// candidates for a person to choose from, because a wrong link is worse than a blank
// one: it looks right, so nobody re-checks it.

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
      .select("id, particulars, caption, publishing_date, sbu, instagram_url")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    // Already linked — say so rather than offering to overwrite it. A link that is
    // already there was either published by us or chosen by a person; both beat a guess.
    if (task.instagram_url) return NextResponse.json({ alreadyLinked: true, url: task.instagram_url });
    if (!task.publishing_date) return NextResponse.json({ reason: "no-publishing-date", candidates: [] });

    const accountId = accountIdForSbu(task.sbu);
    // Samvaya and anything we don't post for. Not an error — there is genuinely no
    // account of ours this task could have gone out on.
    if (!accountId) return NextResponse.json({ reason: "no-account-for-brand", candidates: [] });

    const acc = getAccount(accountId);
    if (!acc) return NextResponse.json({ reason: "account-not-configured", candidates: [] });

    const from = shift(task.publishing_date, -WINDOW_DAYS);
    const to = shift(task.publishing_date, WINDOW_DAYS);
    // Insights are per-post Meta calls and cost seconds each; matching only needs the
    // caption, the permalink and when it went out.
    const posts = await fetchPostsInRange(acc, from, to, { withInsights: false, cap: 60 });

    const { confident, candidates } = matchPost(
      { particulars: task.particulars, caption: task.caption, publishing_date: task.publishing_date },
      posts,
    );

    return NextResponse.json({
      accountId,
      window: { from, to },
      scanned: posts.length,
      confident,
      candidates,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't look up the published post"), { status: 502 });
  }
}
