import { NextResponse } from "next/server";
import { getAirtableDmLeads } from "@/lib/dm-leads-airtable";
import { safeError } from "@/lib/errors";

// Authed (dashboard-only via middleware). Read-only mirror of the Sales Hub "DM Leads"
// table for the Inbox — real leads with their DM Status, counsellor, last-activity and
// an Airtable record link. Returns { configured:false } when no Airtable token is set
// so the Inbox can fall back to its sample layout.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!process.env.AIRTABLE_API_KEY) {
    return NextResponse.json({ configured: false, leads: [] });
  }
  try {
    const leads = await getAirtableDmLeads(60);
    return NextResponse.json({ configured: true, leads });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load Airtable DM leads"), { status: 502 });
  }
}
