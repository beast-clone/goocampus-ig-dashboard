import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import {
  airtableList, pickName, pickNumber, idleDays,
  CRM_TABLE, SALES_SYSTEM_TABLE, TRANSFER_TABLE, CONTRACT_TABLE,
} from "@/lib/sales-hub";
import { pickUser } from "@/lib/lead-assignment";

// GET /api/leads-crm/lead-track?id=recXXXXXXXXXXXXXX
//
// One lead's history, built ENTIRELY from Airtable. Airtable is the source of
// truth for a lead, so tracking one means reading what Airtable already records
// about it — not a copy kept somewhere else.
//
// The events come from four places, all of them already in the base:
//   the lead's own timestamps  — arrived, re-enquired, callback, closed
//   Transfer Ownership          — every ownership change, with who and why
//   Sales System v2.0           — meetings, ratings, AI summaries
//   Contract Generator          — contract raised / sent
//
// The one thing Airtable genuinely cannot give is the sequence of Lead Status
// values: the field is overwritten in place and record revision history isn't
// exposed by the API. Everything else about the lead's life is here.

const REC_ID = /^rec[A-Za-z0-9]{14}$/;

type Event = {
  at: string;             // ISO timestamp
  kind: "arrived" | "assigned" | "reenquiry" | "meeting" | "contract" | "callback" | "closed" | "touched";
  title: string;
  detail?: string;
  who?: string;
  rating?: number | null;
};

const CRM_FIELDS = [
  "Full Name", "Mobile Number", "Email", "Counsellor", "Lead Status", "Created Date",
  "New/Re-Enquiry Date", "Last Re-Enquiry", "Re-Enquiry", "Actual Last Modified",
  "Last Modified By", "Call Attempts", "Notes", "Automated Notes",
  "Lead Source (n8n)", "Primary Interest (n8n)", "Campaign Name", "Location (n8n)",
  "Expected Revenue", "Expected Closure Date", "Actual Closure Date", "Schedule Callback",
  "Move to Contract Stage?", "Link to Record", "Transferred Lead?",
];

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!REC_ID.test(id)) {
    return NextResponse.json({ error: "id must be an Airtable record id" }, { status: 400 });
  }

  try {
    const [leadRows, meetingRows, transferRows, contractRows] = await Promise.all([
      airtableList<Record<string, unknown>>(CRM_TABLE, {
        filterByFormula: `RECORD_ID() = '${id}'`,
        fields: CRM_FIELDS,
        maxRecords: 1,
      }),
      airtableList<Record<string, unknown>>(SALES_SYSTEM_TABLE, {
        filterByFormula: `FIND('${id}', ARRAYJOIN({Link to Record (from Lead Name)}))`,
        fields: ["Particulars", "Meeting Date & Time", "Status", "Assigned Counsellor", "Lead Rating by Counsellor", "Summary", "Counsellor's Notes"],
        pageSize: 50, maxRecords: 50,
      }),
      airtableList<Record<string, unknown>>(TRANSFER_TABLE, {
        filterByFormula: `FIND('${id}', ARRAYJOIN({Record ID}))`,
        fields: ["Created Date", "Original Counsellor (Manual)", "New Owner", "Transfer Notes", "Status", "Requested by"],
        pageSize: 50, maxRecords: 50,
      }),
      airtableList<Record<string, unknown>>(CONTRACT_TABLE, {
        filterByFormula: `FIND('${id}', ARRAYJOIN({Record ID}))`,
        fields: ["Contract ID", "Generated Date", "Contract Status", "Discount Offered", "Validity Date"],
        pageSize: 20, maxRecords: 20,
      }),
    ]);

    if (!leadRows.length) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const f = leadRows[0].fields;
    const events: Event[] = [];
    const push = (e: Event | null) => { if (e && e.at) events.push(e); };

    const created = pickName(f["Created Date"]);
    push(created ? {
      at: created, kind: "arrived", title: "Lead arrived",
      detail: [pickName(f["Lead Source (n8n)"]), pickName(f["Campaign Name"])].filter(Boolean).join(" · ") || undefined,
    } : null);

    // Ownership changes — the answer to "when was it assigned, and by whom".
    for (const t of transferRows) {
      const tf = t.fields;
      const from = pickUser(tf["Original Counsellor (Manual)"])?.name;
      const to = pickUser(tf["New Owner"])?.name;
      const done = pickName(tf["Status"]) === "Transfer Completed";
      push({
        at: pickName(tf["Created Date"]),
        kind: "assigned",
        title: from ? `Moved from ${from} to ${to || "—"}` : `Assigned to ${to || "—"}`,
        detail: [pickName(tf["Transfer Notes"]), done ? undefined : "still pending"].filter(Boolean).join(" · ") || undefined,
        who: pickUser(tf["Requested by"])?.name,
      });
    }

    const reEnq = pickName(f["Last Re-Enquiry"]) || pickName(f["New/Re-Enquiry Date"]);
    if (f["Re-Enquiry"] === true && reEnq) {
      push({ at: reEnq, kind: "reenquiry", title: "Re-enquired", detail: "Came back after going quiet" });
    }

    for (const m of meetingRows) {
      const mf = m.fields;
      push({
        at: pickName(mf["Meeting Date & Time"]),
        kind: "meeting",
        title: pickName(mf["Particulars"]) || "Meeting",
        detail: [pickName(mf["Status"]), pickName(mf["Summary"]).slice(0, 400)].filter(Boolean).join(" · ") || undefined,
        who: pickUser(mf["Assigned Counsellor"])?.name,
        rating: pickNumber(mf["Lead Rating by Counsellor"]) || null,
      });
    }

    for (const c of contractRows) {
      const cf = c.fields;
      push({
        at: pickName(cf["Generated Date"]),
        kind: "contract",
        title: `Contract ${pickName(cf["Contract ID"]) || "raised"}`,
        detail: pickName(cf["Contract Status"]) || undefined,
      });
    }

    const callback = pickName(f["Schedule Callback"]);
    if (callback) push({ at: callback, kind: "callback", title: "Callback scheduled" });

    const closed = pickName(f["Actual Closure Date"]);
    if (closed) push({ at: closed, kind: "closed", title: `Closed — ${pickName(f["Lead Status"]) || "done"}` });

    // Last edit. Only worth showing if nothing else happened that day, otherwise
    // it just repeats the event that caused it.
    const touched = pickName(f["Actual Last Modified"]);
    const modifiedBy = pickUser(f["Last Modified By"])?.name;
    if (touched && !events.some((e) => e.at.slice(0, 10) === touched.slice(0, 10))) {
      push({ at: touched, kind: "touched", title: "Record last edited", who: modifiedBy });
    }

    events.sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first

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
        createdAt: created,
        lastActivityAt: touched,
        lastModifiedBy: modifiedBy || "",
        daysUntouched: idleDays(f),
        callAttempts: pickNumber(f["Call Attempts"]),
        expectedRevenue: pickNumber(f["Expected Revenue"]),
        expectedClosure: pickName(f["Expected Closure Date"]),
        scheduledCallback: callback,
        contractStage: f["Move to Contract Stage?"] === true,
        transferred: f["Transferred Lead?"] === true,
        notes: pickName(f["Notes"]),
        automatedNotes: pickName(f["Automated Notes"]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        link: pickName(f["Link to Record"]),
      },
      events,
      // So the UI can be straight about the one gap rather than implying nothing happened.
      note: "Built from Airtable. Airtable overwrites Lead Status in place and doesn't expose record revision history, so the sequence of stage changes isn't available — everything else about the lead is.",
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load the lead history"), { status: 502 });
  }
}
