import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// PUBLIC endpoint — a lead submits the per-post form (no login). Writes one clean row
// to mh_dm_leads. A lead is "confirmed" only when all 5 details are present; the source
// post + keyword come from the form's hidden fields (baked into the per-post link), so
// attribution is guaranteed, not parsed. Allowlisted in middleware (PUBLIC_API_ROUTES).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Unauthenticated, CSRF-exempt, and it writes a row — so without a limit a
  // script can fill the CRM with fabricated "confirmed" leads, poisoning the
  // pipeline the dashboard exists to run and burning sales time on fake
  // records. Generous enough that a real person submitting twice, or a whole
  // classroom behind one school's NAT, is never blocked.
  //
  // This keys on getClientIp, which trusts the first x-forwarded-for hop and
  // is therefore spoofable (see lib/rate-limit.ts). It raises the bar rather
  // than closing the door, and improves for free when that is fixed.
  const rl = rateLimit("lead-form:" + getClientIp(req.headers), 12, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many submissions — please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec || 60) } });
  }

  try {
    const b = (await req.json().catch(() => ({}))) as Record<string, string>;
    const first = (b.first_name || "").trim();
    const last = (b.last_name || "").trim();
    const email = (b.email || "").trim();
    const phone = (b.phone || "").trim();
    const query = (b.query || "").trim();
    const source = (b.source || "").trim().slice(0, 120);
    const keyword = (b.keyword || "").trim().slice(0, 60);

    if (!first && !email && !phone) {
      return NextResponse.json({ error: "Please share at least your name and a way to reach you." }, { status: 400 });
    }
    const complete = Boolean(first && last && email && phone && query);

    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { error } = await sb.from("mh_dm_leads").insert({
      first_name: first.slice(0, 120), last_name: last.slice(0, 120),
      email: email.slice(0, 200), phone: phone.slice(0, 40), query: query.slice(0, 2000),
      source_post: source, keyword, status: complete ? "confirmed" : "new",
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, status: complete ? "confirmed" : "new" });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not submit the form"), { status: 502 });
  }
}
