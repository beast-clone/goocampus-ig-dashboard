import { NextResponse } from "next/server";
import { runCompetitorWatch, type WatchEvent } from "@/lib/competitor-watch";
import { getSupabase } from "@/lib/supabase";
import { fetchRoster } from "@/lib/team-db";
import { getSessionIsAdmin, isLoggedIn } from "@/lib/auth";
import { safeError } from "@/lib/errors";

// The competitor watcher, every 5 minutes (netlify/functions/competitor-watch-cron.mts),
// or by hand from the Briefing ("Check now", admins only).
//
//   GET /api/cron/competitor-watch            x-cron-secret: <CRON_SECRET>
//   GET /api/cron/competitor-watch?ig=1       also read Instagram (rate-limited by Meta,
//                                             so the cron asks for it every ~15 min)
//
// Anything new becomes a notification for everyone on the team. Webinars and events
// pop up once; blogs, posts and videos go to the bell quietly — ten competitors
// posting several times a day would otherwise interrupt all day.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LABEL: Record<WatchEvent["kind"], string> = {
  event: "webinar / event", blog: "blog post", page: "page on their site", youtube: "YouTube video", instagram: "Instagram post",
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const byCron = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!byCron && !(isLoggedIn() && getSessionIsAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t0 = Date.now();
  try {
    const ig = new URL(req.url).searchParams.get("ig") === "1";
    const result = await runCompetitorWatch({ instagram: ig });

    // Notify the team.
    const sb = getSupabase();
    if (sb && result.events.length) {
      const people = (await fetchRoster()).filter((u) => u.active).map((u) => u.id);
      const now = new Date().toISOString();
      const rows = result.events.flatMap((e) => people.map((p) => ({
        recipient_key: p,
        source_id: `competitor:${e.kind}:${e.url}`,
        kind: e.kind === "event" ? "competitor_event" : "competitor",
        category: "competitor",
        action_needed: false,
        emoji: e.kind === "event" ? "📣" : "🔎",
        title: `${e.name} · new ${LABEL[e.kind]}`,
        sub: e.title,
        post_id: null,
        payload: { href: `/dashboard/preview/briefing?c=${encodeURIComponent(e.handle)}`, url: e.url },
        created_at: now,
      })));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sb.from("mh_notifications").upsert(rows.slice(i, i + 500), { onConflict: "recipient_key,source_id", ignoreDuplicates: true });
        if (error) result.errors.push(`notifications: ${error.message}`);
      }
    }

    console.log(`[competitor-watch] ${result.competitors} competitors, ${result.events.length} new, ${result.baselined.length} baselined, ${result.errors.length} errors, ${Date.now() - t0}ms`);
    return NextResponse.json({ ok: true, ms: Date.now() - t0, ...result });
  } catch (err) {
    console.error("[competitor-watch] failed", err);
    return NextResponse.json(safeError(err, "Competitor watch failed"), { status: 502 });
  }
}
