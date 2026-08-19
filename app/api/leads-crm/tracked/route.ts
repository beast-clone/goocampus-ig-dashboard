import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getSessionUserId } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

// Leads pinned to the Leads-tracker tab.
//
//   GET    /api/leads-crm/tracked            → { ids: string[], persisted }
//   POST   /api/leads-crm/tracked            → { leadId, leadName, on }  (star / unstar)
//
// Starring only decides what surfaces on that tab. Every lead's history is
// recorded by the nightly snapshot either way.

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
const MISSING_TABLE = /relation .* does not exist/i;

export async function GET() {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const db = getSupabase();
    if (!db) return NextResponse.json({ ids: [], persisted: false });
    const { data, error } = await db.from("lead_tracked").select("lead_id").order("added_at", { ascending: false });
    if (error) return NextResponse.json({ ids: [], persisted: false });
    return NextResponse.json({ ids: (data || []).map((r) => r.lead_id as string), persisted: true });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load tracked leads"), { status: 502 });
  }
}

export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const body = (await req.json()) as { leadId?: string; leadName?: string; on?: boolean };
    if (!body.leadId || !REC_ID.test(body.leadId)) {
      return NextResponse.json({ error: "leadId must be an Airtable record id" }, { status: 400 });
    }
    const db = getSupabase();
    if (!db) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

    const { error } = body.on === false
      ? await db.from("lead_tracked").delete().eq("lead_id", body.leadId)
      : await db.from("lead_tracked").upsert(
          { lead_id: body.leadId, lead_name: body.leadName || null, added_by: getSessionUserId() || null },
          { onConflict: "lead_id" },
        );

    if (error) {
      if (MISSING_TABLE.test(error.message)) {
        return NextResponse.json(
          { error: "Tracking table is missing — run supabase/lead-roles-and-tracking.sql in the Supabase SQL editor first." },
          { status: 503 },
        );
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true, leadId: body.leadId, on: body.on !== false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not update tracking"), { status: 502 });
  }
}
