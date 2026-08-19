import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { getSupabase } from "@/lib/supabase";
import { airtableList, pickName, pickNumber, idleDays, CRM_TABLE, SALES_SYSTEM_TABLE } from "@/lib/sales-hub";
import { pickUser } from "@/lib/lead-assignment";

// GET /api/leads-crm/lead-track?id=recXXXXXXXXXXXXXX
//
// "Track this lead" — everything known about one lead in one place:
//   · where it stands now (live from Airtable)
//   · how it got there (the nightly snapshots, collapsed into change events)
//   · every meeting held on it, with the counsellor's rating and AI summary
//
// History only goes back to the day the nightly snapshot started running, and
// that's stated in the payload so the UI doesn't imply a lead was idle when it
// simply predates tracking.

const REC_ID = /^rec[A-Za-z0-9]{14}$/;

type Change = { date: string; field: "status" | "counsellor"; from: string; to: string };

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!REC_ID.test(id)) {
    return NextResponse.json({ error: "id must be an Airtable record id" }, { status: 400 });
  }

  try {
    const db = getSupabase();

    const [leadRows, meetingRows, history] = await Promise.all([
      airtableList<Record<string, unknown>>(CRM_TABLE, {
        filterByFormula: `RECORD_ID() = '${id}'`,
        fields: [
          "Full Name", "Mobile Number", "Email", "Counsellor", "Lead Status", "Created Date",
          "Actual Last Modified", "Days Untouched", "Call Attempts", "Notes", "Automated Notes",
          "Lead Source (n8n)", "Primary Interest (n8n)", "Campaign Name", "Location (n8n)",
          "Expected Revenue", "Expected Closure Date", "Schedule Callback", "Link to Record",
          "Re-Enquiry", "Last Re-Enquiry", "Move to Contract Stage?",
        ],
        maxRecords: 1,
      }),
      airtableList<Record<string, unknown>>(SALES_SYSTEM_TABLE, {
        filterByFormula: `FIND('${id}', ARRAYJOIN({Link to Record (from Lead Name)}))`,
        fields: ["Particulars", "Meeting Date & Time", "Status", "Assigned Counsellor", "Lead Rating by Counsellor", "Summary", "Counsellor's Notes"],
        pageSize: 50,
        maxRecords: 50,
      }),
      db
        ? db.from("lead_status_snapshots")
            .select("snapshot_date, status, counsellor, days_untouched, call_attempts")
            .eq("lead_id", id)
            .order("snapshot_date", { ascending: true })
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (!leadRows.length) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    const f = leadRows[0].fields;

    // Collapse the daily rows into just the days something actually changed —
    // a row per day would be noise, and most days nothing moves.
    const snaps = (history as { data: Array<Record<string, unknown>> | null }).data || [];
    const changes: Change[] = [];
    let prevStatus: string | null = null;
    let prevCounsellor: string | null = null;
    for (const s of snaps) {
      const date = String(s.snapshot_date);
      const status = (s.status as string) || "";
      const counsellor = (s.counsellor as string) || "";
      if (prevStatus !== null && status !== prevStatus) changes.push({ date, field: "status", from: prevStatus, to: status });
      if (prevCounsellor !== null && counsellor !== prevCounsellor) changes.push({ date, field: "counsellor", from: prevCounsellor, to: counsellor });
      prevStatus = status;
      prevCounsellor = counsellor;
    }

    const meetings = meetingRows
      .map((m) => ({
        title: pickName(m.fields["Particulars"]),
        when: pickName(m.fields["Meeting Date & Time"]),
        status: pickName(m.fields["Status"]),
        counsellor: pickUser(m.fields["Assigned Counsellor"])?.name || "",
        rating: pickNumber(m.fields["Lead Rating by Counsellor"]) || null,
        summary: pickName(m.fields["Summary"]),
        notes: pickName(m.fields["Counsellor's Notes"]),
      }))
      .sort((a, b) => (a.when < b.when ? 1 : -1));

    return NextResponse.json({
      lead: {
        id,
        name: pickName(f["Full Name"]) || "(no name)",
        mobile: pickName(f["Mobile Number"]),
        email: pickName(f["Email"]),
        counsellor: pickUser(f["Counsellor"])?.name || "",
        status: pickName(f["Lead Status"]) || "—",
        source: pickName(f["Lead Source (n8n)"]) || "—",
        interest: pickName(f["Primary Interest (n8n)"]) || "—",
        campaign: pickName(f["Campaign Name"]),
        location: pickName(f["Location (n8n)"]),
        createdAt: pickName(f["Created Date"]),
        lastActivityAt: pickName(f["Actual Last Modified"]),
        daysUntouched: idleDays(f),
        callAttempts: pickNumber(f["Call Attempts"]),
        expectedRevenue: pickNumber(f["Expected Revenue"]),
        expectedClosure: pickName(f["Expected Closure Date"]),
        scheduledCallback: pickName(f["Schedule Callback"]),
        reEnquiry: f["Re-Enquiry"] === true,
        lastReEnquiry: pickName(f["Last Re-Enquiry"]),
        contractStage: f["Move to Contract Stage?"] === true,
        notes: pickName(f["Notes"]),
        automatedNotes: pickName(f["Automated Notes"]),
        link: pickName(f["Link to Record"]),
      },
      changes: changes.reverse(), // newest first
      meetings,
      // So the UI can say "tracked since X" rather than implying a silent history.
      trackedSince: snaps.length ? String(snaps[0].snapshot_date) : null,
      snapshotDays: snaps.length,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load the lead tracker"), { status: 502 });
  }
}
