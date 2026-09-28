import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { safeError } from "@/lib/errors";
import { getSupabase } from "@/lib/supabase";
import { accountIdForSbu, matchPost, WINDOW_DAYS, shiftDate, type Candidate, type MatchTask } from "@/lib/post-match";
import { fetchLivePosts, type LinkPlatform } from "@/lib/published-posts";
import { fetchContentTypes } from "@/lib/content-types-db";

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
// separately per platform, because a task usually goes out on more than one and each
// has its own link to find.
//
// Per platform it returns `confident` only when the match is not in doubt. Otherwise
// it returns candidates for a person to choose from, because a wrong link is worse
// than a blank one: it looks right, so nobody re-checks it.
//
// The nightly job (api/cron/link-published) applies the same rule unattended; both
// read their posts through lib/published-posts so they cannot disagree.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 26;

type PlatformResult = {
  alreadyLinked?: string;
  /** Why there is nothing to offer, when that is not a failure. */
  reason?: string;
  scanned: number;
  confident: Candidate | null;
  candidates: Candidate[];
};
const nothing = (reason: string): PlatformResult => ({ reason, scanned: 0, confident: null, candidates: [] });
const allNothing = (reason: string) => ({
  reason,
  instagram: nothing(reason), facebook: nothing(reason), linkedin: nothing(reason),
});

export async function GET(req: Request) {
  await fetchContentTypes();   // registers dashboard-added types into VIDEO_TYPES (sql/028)
  const __denied = await requireSection("content");
  if (__denied) return __denied;

  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { data: task, error } = await sb
      .from("mh_posts")
      .select("id, particulars, caption, publishing_date, sbu, type, instagram_url, facebook_url, linkedin_url")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

    if (!task.publishing_date) return NextResponse.json(allNothing("no-publishing-date"));
    // Samvaya and anything we don't post for. Not an error — there is genuinely no
    // account of ours this task could have gone out on.
    const accountId = accountIdForSbu(task.sbu);
    if (!accountId) return NextResponse.json(allNothing("no-account-for-brand"));

    const from = shiftDate(task.publishing_date, -WINDOW_DAYS);
    const to = shiftDate(task.publishing_date, WINDOW_DAYS);
    const live = await fetchLivePosts(accountId, from, to);

    // Posts that already belong to a DIFFERENT task are not candidates for this one.
    // Each match looks fine judged alone, which is how the same LinkedIn post came to
    // be proposed for two different carousels; one live post is one task's.
    const { data: others } = await sb
      .from("mh_posts")
      .select("id, instagram_url, facebook_url, linkedin_url")
      .neq("id", task.id);
    const claimed = new Set<string>();
    for (const r of (others as { instagram_url: string | null; facebook_url: string | null; linkedin_url: string | null }[] | null) || []) {
      for (const u of [r.instagram_url, r.facebook_url, r.linkedin_url]) if (u) claimed.add(u);
    }

    const mt: MatchTask = { particulars: task.particulars, caption: task.caption, publishing_date: task.publishing_date, type: task.type };
    const existing: Record<LinkPlatform, string | null> = {
      instagram: task.instagram_url, facebook: task.facebook_url, linkedin: task.linkedin_url,
    };

    const out = {} as Record<LinkPlatform, PlatformResult>;
    for (const p of ["instagram", "facebook", "linkedin"] as LinkPlatform[]) {
      // A link that is already there was either published by us or chosen by a person;
      // both beat a guess, so it is never offered for overwrite.
      if (existing[p]) { out[p] = { alreadyLinked: existing[p] as string, scanned: 0, confident: null, candidates: [] }; continue; }
      if (live[p].reason) { out[p] = nothing(live[p].reason as string); continue; }
      const pool = live[p].posts.filter((post) => !post.permalink || !claimed.has(post.permalink));
      const { confident, candidates } = matchPost(mt, pool);
      out[p] = { scanned: pool.length, confident, candidates };
    }

    return NextResponse.json({ accountId, window: { from, to }, ...out });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't look up the published post"), { status: 502 });
  }
}
