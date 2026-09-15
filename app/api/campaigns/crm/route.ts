import { NextResponse } from "next/server";
import { requireSection } from "@/lib/api-guard";
import { getCampaign } from "@/lib/campaigns";
import { readTab, SheetError } from "@/lib/sheets";
import { SALES_HUB_BASE, CRM_TABLE } from "@/lib/sales-hub";
import { safeError } from "@/lib/errors";

// Push campaign leads into the Sales Hub CRM.
//
//   POST { id, rowKeys: string[] } → { created, skipped, failed }
//
// One lead or a hundred: the UI sends whichever rows are ticked.
export const dynamic = "force-dynamic";

const AIRTABLE_PAT = process.env.AIRTABLE_PAT || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY || "";

// Field names read off the live table rather than assumed.
//
// Campaign Name is deliberately NOT written: that field is permission-locked on
// this base and a create including it fails outright. The campaign is recorded in
// Lead Source instead, which is writable and is what the reports read anyway.
type CrmFields = Record<string, string>;

function pickName(fields: Record<string, string>, headers: string[]) {
  const find = (re: RegExp) => headers.find((h) => re.test(h));
  const first = find(/^first\s*name$/i), last = find(/^last\s*name$/i);
  if (first || last) return { first: (first && fields[first]) || "", last: (last && fields[last]) || "" };
  const any = find(/name/i);
  const whole = (any && fields[any]) || "";
  const bits = whole.trim().split(/\s+/);
  return { first: bits[0] || "", last: bits.slice(1).join(" ") };
}

export async function POST(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  if (!AIRTABLE_PAT) return NextResponse.json({ error: "Airtable isn't configured on this server." }, { status: 500 });

  try {
    const b = (await req.json().catch(() => ({}))) as { id?: string; rowKeys?: string[] };
    const campaign = await getCampaign(b.id || "");
    if (!campaign) return NextResponse.json({ error: "No such campaign" }, { status: 404 });
    const wanted = new Set((b.rowKeys || []).map((k) => k.trim()).filter(Boolean));
    if (wanted.size === 0) return NextResponse.json({ error: "No leads selected" }, { status: 400 });

    // Re-read rather than trusting what the browser holds: the sheet may have
    // moved on, and pushing a stale row into the CRM is not undoable.
    const { headers, rows } = await readTab(campaign.spreadsheetId, campaign.tab);
    const phoneCol = headers.find((h) => /phone|mobile|contact|whats/i.test(h));
    const emailCol = headers.find((h) => /e-?mail/i.test(h));
    const interestCol = headers.find((h) => /interest|course|programme|program/i.test(h));

    const chosen = rows.filter((r) => wanted.has((r[campaign.keyColumn] || "").trim()));
    const skipped: { rowKey: string; why: string }[] = [];
    const records: { fields: CrmFields }[] = [];

    for (const r of chosen) {
      const rowKey = (r[campaign.keyColumn] || "").trim();
      const phone = (phoneCol && r[phoneCol]) || "";
      // A CRM record with no way to reach the person is just noise in a table
      // someone else has to clean up.
      if (!phone.replace(/\D/g, "")) { skipped.push({ rowKey, why: "no phone number" }); continue; }

      const { first, last } = pickName(r, headers);
      const fields: CrmFields = {
        "First Name": first,
        "Last Name": last,
        "Mobile Number": phone,
        // Where it came from, in the field the reports already read. Campaign Name
        // is locked on this base, so the campaign goes here and in the notes.
        "Lead Source (n8n)": `Offline event — ${campaign.name}`,
        "Automated Notes": `Imported from the ${campaign.name} sheet (${campaign.tab}), row ${campaign.keyColumn} ${rowKey}.`,
      };
      if (emailCol && r[emailCol]) fields["Email"] = r[emailCol];
      if (interestCol && r[interestCol]) fields["Primary Interest (n8n)"] = r[interestCol];
      records.push({ fields });
    }

    if (records.length === 0) {
      return NextResponse.json({ created: 0, skipped, failed: [] });
    }

    // Airtable takes ten records per request.
    let created = 0;
    const failed: string[] = [];
    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10);
      const res = await fetch(`https://api.airtable.com/v0/${SALES_HUB_BASE}/${CRM_TABLE}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, "Content-Type": "application/json" },
        body: JSON.stringify({ records: batch, typecast: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) created += (body.records || []).length;
      else failed.push(body?.error?.message || `Airtable ${res.status}`);
    }

    return NextResponse.json({ created, skipped, failed });
  } catch (err) {
    if (err instanceof SheetError) return NextResponse.json({ error: err.message, kind: err.kind }, { status: 200 });
    return NextResponse.json(safeError(err, "Couldn't send to the CRM"), { status: 502 });
  }
}
