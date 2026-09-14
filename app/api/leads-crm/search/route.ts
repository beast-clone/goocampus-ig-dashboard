import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { airtableList, CRM_TABLE, SALES_HUB_BASE, pickName, idleDays } from "@/lib/sales-hub";
import { getCounsellorRoster, pickUser } from "@/lib/lead-assignment";

// Find any lead across the whole CRM (~35k rows) by name / phone / email, with
// optional counsellor / status / interest / source filters. Airtable does the
// filtering server-side (filterByFormula), so we never load the whole table — we
// ask for the matches and return the first page. Read-only.
//
//   GET /api/leads-crm/search?q=&counsellor=&status=&interest=&source=&limit=
//        → { leads[], roster[], truncated, count }
export const dynamic = "force-dynamic";

// Strip anything that could break out of a single-quoted Airtable formula string
// (formula injection) and cap the length. Everything is matched case-insensitively.
const esc = (s: string) => String(s || "").replace(/['"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);

export async function GET(req: Request) {
  const denied = await requireSection("sales");
  if (denied) return denied;
  try {
    const u = new URL(req.url);
    const q = esc(u.searchParams.get("q") || "").toLowerCase();
    const counsellor = esc(u.searchParams.get("counsellor") || "").toLowerCase();
    const status = esc(u.searchParams.get("status") || "").toLowerCase();
    const interest = esc(u.searchParams.get("interest") || "").toLowerCase();
    const source = esc(u.searchParams.get("source") || "").toLowerCase();
    const limit = Math.min(200, Math.max(10, Number(u.searchParams.get("limit")) || 50));

    const clauses: string[] = [];
    if (q) clauses.push(`OR(SEARCH('${q}',LOWER({Full Name}&'')),SEARCH('${q}',LOWER({Email}&'')),SEARCH('${q}',{Mobile Number}&''),SEARCH('${q}',{Raw 10-Digit Number}&''))`);
    if (counsellor) clauses.push(`SEARCH('${counsellor}',LOWER({Counsellor}&''))`);
    if (status) clauses.push(`SEARCH('${status}',LOWER({Lead Status}&''))`);
    if (interest) clauses.push(`SEARCH('${interest}',LOWER({Primary Interest (n8n)}&''))`);
    if (source) clauses.push(`SEARCH('${source}',LOWER({Lead Source (n8n)}&''))`);
    const filterByFormula = clauses.length ? (clauses.length === 1 ? clauses[0] : `AND(${clauses.join(",")})`) : undefined;

    const [rows, roster] = await Promise.all([
      airtableList<Record<string, unknown>>(CRM_TABLE, {
        filterByFormula,
        fields: ["Full Name", "Counsellor", "Lead Status", "Primary Interest (n8n)", "Lead Source (n8n)", "Created Date", "Actual Last Modified", "Mobile Number", "Email", "Location (n8n)"],
        sort: [{ field: "Created Date", direction: "desc" }],
        pageSize: 100,
        maxRecords: limit + 1, // one extra row tells us there are more matches
      }),
      getCounsellorRoster(),
    ]);

    const truncated = rows.length > limit;
    const leads = rows.slice(0, limit).map((r) => {
      const c = pickUser(r.fields["Counsellor"]);
      return {
        id: r.id,
        name: pickName(r.fields["Full Name"]) || "(no name)",
        counsellor: c ? { id: c.id, name: c.name } : null,
        status: pickName(r.fields["Lead Status"]),
        interest: pickName(r.fields["Primary Interest (n8n)"]),
        source: pickName(r.fields["Lead Source (n8n)"]),
        location: pickName(r.fields["Location (n8n)"]),
        phone: pickName(r.fields["Mobile Number"]),
        email: pickName(r.fields["Email"]),
        created: pickName(r.fields["Created Date"]),
        idleDays: idleDays(r.fields),
        link: `https://airtable.com/${SALES_HUB_BASE}/${CRM_TABLE}/${r.id}`,
      };
    });

    return NextResponse.json({ leads, roster, truncated, count: leads.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Lead search failed"), { status: 502 });
  }
}
