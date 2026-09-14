import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { airtableGetRecord, CRM_TABLE, SALES_HUB_BASE, pickName, idleDays } from "@/lib/sales-hub";
import { pickUser } from "@/lib/lead-assignment";

// One lead's full detail — everything the CRM holds on it, grouped for the detail
// panel. Read-only (the CRM is never edited from the dashboard).
//   GET /api/leads-crm/lead?id=rec...
export const dynamic = "force-dynamic";

// The CRM fields worth showing, grouped. Any that are empty are dropped client-side.
const GROUPS: { title: string; fields: string[] }[] = [
  { title: "Contact", fields: ["Mobile Number", "Email", "STD Code", "Gender", "Location (n8n)"] },
  { title: "Lead", fields: ["Lead Status", "Primary Interest (n8n)", "Lead Source (n8n)", "Campaign Name", "Marketing Lead", "NEET PG Status", "NEET UG Status"] },
  { title: "Timeline", fields: ["Created Date", "New/Re-Enquiry Date", "Actual Last Modified", "Last Modified By", "Call Attempts", "Lead Age", "Days to Convert", "Expected Closure Date (Formatted)", "Schedule Callback [Formatted]", "Callback End [Formatted]"] },
  { title: "Notes & history", fields: ["Notes", "Automated Notes", "Last Modified Notes"] },
];

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return NextResponse.json({ error: "A valid lead id is required" }, { status: 400 });

    const rec = await airtableGetRecord<Record<string, unknown>>(CRM_TABLE, id);
    if (!rec) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const f = rec.fields;
    const c = pickUser(f["Counsellor"]);

    // ISO timestamps read as noise (2026-09-08T19:30:32.000Z) — show them as a
    // readable IST date/time instead. Everything else passes through untouched.
    const fmtVal = (v: string) => {
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      }
      return v;
    };
    const groups = GROUPS.map((g) => ({
      title: g.title,
      rows: g.fields.map((name) => ({ label: name.replace(/\s*\(n8n\)|\s*\[Formatted\]|\s*\(Formatted\)/g, ""), value: fmtVal(pickName(f[name])) })).filter((r) => r.value),
    })).filter((g) => g.rows.length);

    return NextResponse.json({
      id: rec.id,
      name: pickName(f["Full Name"]) || "(no name)",
      counsellor: c ? { id: c.id, name: c.name } : null,
      idleDays: idleDays(f),
      link: `https://airtable.com/${SALES_HUB_BASE}/${CRM_TABLE}/${rec.id}`,
      groups,
    });
  } catch (err) {
    return NextResponse.json(safeError(err, "Could not load the lead"), { status: 502 });
  }
}
