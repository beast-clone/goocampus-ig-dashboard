import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionIsAdmin } from "@/lib/auth";
import { switchGmailSender } from "@/lib/gmail-api";
import { safeError } from "@/lib/errors";

// POST /api/watchers/sender { email }
// Change which connected account notices go out as. Instant: the grant for that
// address is already held, so there is no trip to Google and nothing to agree to
// a second time.
//
// Admin only — it changes the From address on everything the dashboard sends, for
// everyone, not just for the person clicking.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  if (!getSessionIsAdmin()) return NextResponse.json({ error: "Only an admin can change the sending account." }, { status: 403 });

  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  try {
    await switchGmailSender(email);
    return NextResponse.json({ ok: true, from: email });
  } catch (err) {
    return NextResponse.json(safeError(err, "Couldn't change the sending account"), { status: 400 });
  }
}
