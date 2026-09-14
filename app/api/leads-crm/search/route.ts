import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import { requireSection } from "@/lib/api-guard";
import { airtableList, CRM_TABLE, SALES_HUB_BASE, pickName, idleDays, dateRangeFormula, DISTRIBUTION_MASTERSHEET, LEAD_DISTRIBUTION_BASE } from "@/lib/sales-hub";
import { getCounsellorRoster, pickUser } from "@/lib/lead-assignment";

const isYMD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const fmtDay = (v: string) => { if (!v) return ""; const d = new Date(v); return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }); };

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
    const from = u.searchParams.get("from") || "";
    const to = u.searchParams.get("to") || "";
    const limit = Math.min(200, Math.max(10, Number(u.searchParams.get("limit")) || 50));

    const clauses: string[] = [];
    if (q) clauses.push(`OR(SEARCH('${q}',LOWER({Full Name}&'')),SEARCH('${q}',LOWER({Email}&'')),SEARCH('${q}',{Mobile Number}&''),SEARCH('${q}',{Raw 10-Digit Number}&''))`);
    if (counsellor) clauses.push(`SEARCH('${counsellor}',LOWER({Counsellor}&''))`);
    if (status) clauses.push(`SEARCH('${status}',LOWER({Lead Status}&''))`);
    if (interest) clauses.push(`SEARCH('${interest}',LOWER({Primary Interest (n8n)}&''))`);
    if (source) clauses.push(`SEARCH('${source}',LOWER({Lead Source (n8n)}&''))`);
    // Duration filter — leads created within a date range (IST calendar days).
    if (isYMD(from) && isYMD(to)) clauses.push(dateRangeFormula("Created Date", from, to));
    else if (isYMD(from)) clauses.push(dateRangeFormula("Created Date", from, "2999-12-31"));
    else if (isYMD(to)) clauses.push(dateRangeFormula("Created Date", "2000-01-01", to));
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
        created: fmtDay(pickName(r.fields["Created Date"])),
        createdIso: pickName(r.fields["Created Date"]), // raw timestamp for the live waiting clock
        assigned: "" as string, // filled from the distribution log below
        idleDays: idleDays(r.fields),
        link: `https://airtable.com/${SALES_HUB_BASE}/${CRM_TABLE}/${r.id}`,
      };
    });

    // Assigned date: the CRM has no assigned-on field — the real handover time lives
    // in the Lead Distribution log (keyed by Lead Record ID). Join it for the leads
    // on this page only (best-effort — the search still works if the log read fails).
    if (leads.length) {
      try {
        const orIds = `OR(${leads.map((l) => `{Lead Record ID}='${l.id}'`).join(",")})`;
        const logs = await airtableList<Record<string, unknown>>(DISTRIBUTION_MASTERSHEET, {
          baseId: LEAD_DISTRIBUTION_BASE, filterByFormula: orIds,
          fields: ["Lead Record ID", "Assigned Time"], pageSize: 100, maxRecords: leads.length * 4,
        });
        const latest: Record<string, string> = {};
        for (const lg of logs) {
          const rid = pickName(lg.fields["Lead Record ID"]);
          const at = pickName(lg.fields["Assigned Time"]);
          if (!rid || !at) continue;
          const prev = latest[rid];
          if (!prev || (new Date(at).getTime() || 0) > (new Date(prev).getTime() || 0)) latest[rid] = at;
        }
        for (const l of leads) { const at = latest[l.id]; if (at) l.assigned = fmtDay(at); }
      } catch { /* log unavailable — leave assigned blank */ }
    }

    return NextResponse.json({ leads, roster, truncated, count: leads.length });
  } catch (err) {
    return NextResponse.json(safeError(err, "Lead search failed"), { status: 502 });
  }
}
