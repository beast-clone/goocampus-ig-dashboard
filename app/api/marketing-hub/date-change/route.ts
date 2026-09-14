import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { getSessionUserId } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { bustMarketingHubCache } from "@/lib/mh-cache";
import { listPendingDateChanges, resolveDateChange, APPROVER_KEY } from "@/lib/date-approvals";

// Publish-date change approvals.
//   GET  /api/marketing-hub/date-change              → pending requests (for the panel)
//   POST /api/marketing-hub/date-change { postId, action:"approve"|"reject", actor? }
//        → approve writes the date; reject discards. Only Maheen may resolve.
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireSection("content");
  if (denied) return denied;
  const sb = getSupabase();
  if (!sb) return NextResponse.json({ requests: [] });
  try {
    return NextResponse.json({ requests: await listPendingDateChanges(sb) });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load date-change requests"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requireSection("content");
  if (denied) return denied;
  try {
    const body = (await req.json()) as { postId?: string; action?: "approve" | "reject"; actor?: string; note?: string };
    const approver = (body.actor || getSessionUserId() || "").toLowerCase();
    if (approver !== APPROVER_KEY) {
      return NextResponse.json({ error: "Only Maheen can approve or reject publish-date changes." }, { status: 403 });
    }
    if (!body.postId || (body.action !== "approve" && body.action !== "reject")) {
      return NextResponse.json({ error: "postId and action (approve|reject) are required" }, { status: 400 });
    }
    const sb = getSupabase();
    if (!sb) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const r = await resolveDateChange(sb, { postId: body.postId, action: body.action, approverKey: approver, note: typeof body.note === "string" ? body.note : undefined });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    bustMarketingHubCache();
    return NextResponse.json({ ok: true, request: r.request });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not resolve the date-change request"), { status: 502 });
  }
}
