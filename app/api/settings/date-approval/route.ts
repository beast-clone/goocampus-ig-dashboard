import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { rosterById } from "@/lib/team-db";
import { safeError } from "@/lib/errors";
import { dateApprovalOn, setDateApprovalOn } from "@/lib/date-approvals";

// Is a publish-date change held for Maheen's approval? (lib/date-approvals.ts)
// GET: anyone working on content — the calendar asks before showing the reason box.
// POST { on }: admins only.

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ on: true });
  try {
    return NextResponse.json({ on: await dateApprovalOn(sb) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not read the setting"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const me = await rosterById(getSessionUserId());
  if (!me?.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  try {
    const body = (await req.json()) as { on?: unknown };
    if (typeof body.on !== "boolean") return NextResponse.json({ error: "on (true/false) is required" }, { status: 400 });
    await setDateApprovalOn(sb, body.on, me.id);
    return NextResponse.json({ on: body.on });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not save the setting"), { status: 502 });
  }
}
