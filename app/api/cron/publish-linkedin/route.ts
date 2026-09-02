import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { publishToPages } from "@/lib/linkedin-publish";
import { ensureFreshLinkedInToken } from "@/lib/linkedin-refresh";

// Cron worker — publishes due LinkedIn scheduled posts. Fully separate from the Meta
// (n8n) pipeline. Trigger this on a schedule from your existing cron pinger / n8n:
//   POST (or GET) /api/cron/publish-linkedin   with header  x-cron-secret: <CRON_SECRET>
// Runs every few minutes; publishes rows whose schedule_time has passed.
export const dynamic = "force-dynamic";

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  // Renew the LinkedIn token before publishing anything. This tick runs every few
  // minutes anyway, which makes it the natural place to keep the 2-month token
  // alive — it is a no-op until the token is inside its renewal window. Never let
  // a renewal problem stop the publish attempt; the publish reports its own error.
  const tokenState = await ensureFreshLinkedInToken().catch((e) => ({ ok: false as const, error: (e as Error).message }));

  // Due = scheduled and time has passed. Bounded batch so a tick can't run away.
  const nowIso = new Date().toISOString();
  const { data: due, error } = await sb
    .from("linkedin_scheduled_posts")
    .select("id, pages, body, image_url")
    .eq("status", "scheduled")
    .lte("schedule_time", nowIso)
    .order("schedule_time", { ascending: true })
    .limit(10);
  if (error) return NextResponse.json(safeError(new Error(error.message), "query failed"), { status: 502 });
  if (!due || due.length === 0) return NextResponse.json({ ok: true, published: 0, processed: 0, token: tokenState });

  let published = 0;
  const outcomes: { id: string; status: string }[] = [];
  for (const row of due) {
    // Claim the row so overlapping ticks can't double-publish (only proceed if we flip
    // it from 'scheduled' to 'publishing').
    const { data: claimed } = await sb
      .from("linkedin_scheduled_posts")
      .update({ status: "publishing" })
      .eq("id", row.id).eq("status", "scheduled")
      .select("id").maybeSingle();
    if (!claimed) { outcomes.push({ id: row.id, status: "skipped" }); continue; }

    const results = await publishToPages((row.pages as string[]) || [], (row.body as string) || "", row.image_url as string | null);
    const anyOk = results.some((r) => r.ok);
    const finalStatus = anyOk ? "published" : "failed";
    if (anyOk) published++;
    await sb.from("linkedin_scheduled_posts").update({
      status: finalStatus,
      results,
      error: anyOk ? null : results.map((r) => (r.ok ? "" : r.error)).filter(Boolean).join("; "),
      published_at: anyOk ? new Date().toISOString() : null,
    }).eq("id", row.id);
    outcomes.push({ id: row.id, status: finalStatus });
  }

  return NextResponse.json({ ok: true, processed: due.length, published, outcomes, token: tokenState });
}

export async function POST(req: Request) { return run(req); }
export async function GET(req: Request) { return run(req); }
