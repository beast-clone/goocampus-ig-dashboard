import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { checkWatcher, type Watcher } from "@/lib/watchers";
import { safeError } from "@/lib/errors";

// Check a watcher using HTML somebody else fetched.
//   POST /api/cron/watcher-ingest   Header: x-cron-secret: <CRON_SECRET>
//   { id?: "<watcher id>", url?: "<watched url>", html: "<page source>" }
//
// It sits under /api/cron because that is where this app keeps the endpoints a
// MACHINE calls: the middleware session-gates every other /api/ path, and also
// skips the CSRF origin check here — n8n sends neither a cookie nor an Origin,
// so anywhere else it would be refused before reaching this code.
//
// Some government sites answer an Indian IP in under a second and refuse a US
// one outright. cetonline.karnataka.gov.in is the standing example: the KEA
// watcher has recorded "Couldn't open the page" on every run since it was added
// while the page itself has been perfectly healthy, and no timeout or retry here
// could ever have fixed that — the request never gets to leave.
//
// So the fetch moves to a host the site does answer. n8n on the Hostinger VPS
// reads the page and posts the HTML here; everything after the fetch — link
// extraction, diffing, summaries, alerts — is the same code path as a direct
// check, so a page read this way behaves exactly like one read by the server.
// lib/watchers.ts documents the other half of this.
//
// `html: null` means the fetch was ATTEMPTED AND FAILED. That is not the same as
// sending nothing: checkWatcher treats a failed read as "change nothing", which
// is what stops a blocked site from looking like a page that lost all its
// notices and then re-announcing every one of them on the next good read.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A page of links, not a file upload. Netlify caps a function's payload well
// below this anyway; the point is to fail with a clear reason rather than an
// opaque 502 further in.
const MAX_HTML = 5_000_000;

type Body = { id?: string; url?: string; html?: string | null };

export async function POST(req: Request) {
  // The same gate as its neighbours, and n8n already sends this header. Note
  // the `secret &&`: with CRON_SECRET unset the route is open, which matches the
  // other machine endpoints and is only true in local dev — the variable is
  // always set in production. It has to be set there, because anything that can
  // post here can make the dashboard announce a notice.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.id && !body.url) return NextResponse.json({ error: "id or url required" }, { status: 400 });
  if (typeof body.html === "string" && body.html.length > MAX_HTML) {
    return NextResponse.json({ error: "That page is too large to ingest" }, { status: 413 });
  }
  // Sending neither is a mistake worth naming: it would silently be read as a
  // failed fetch and quietly change nothing.
  if (body.html === undefined) {
    return NextResponse.json({ error: "html required — send null to record a failed fetch" }, { status: 400 });
  }

  try {
    const q = sb.from("mh_watchers").select("*");
    const { data, error } = body.id ? await q.eq("id", body.id).single() : await q.eq("url", body.url!).single();
    if (error || !data) throw new Error(error?.message || "Watcher not found");

    const w = data as Watcher;
    if (!w.active) return NextResponse.json({ watcher: w.name, skipped: "watcher is paused" });

    return NextResponse.json(await checkWatcher(w, body.html ?? null));
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't ingest that page"), { status: 502 });
  }
}
