// Read-only mirror of the Sales Hub → "DM Leads" table (tbl8CpgnQSYcbFKEH) for the
// dashboard Inbox. Pulls the real Instagram DM leads with their DM Status, Counsellor,
// last-activity time and Primary Interest, and builds a deep-link back to each record.
//
// NO WRITES. Uses the read-only airtableList() client (see lib/sales-hub.ts — the base
// has ~1.6k DM leads and a 30k-row CRM with no backup). Pushing new leads INTO Airtable
// is a separate, explicitly-gated step and is intentionally not done here.

import {
  airtableList, pickName, SALES_HUB_BASE, DM_LEADS_TABLE, PRIMARY_INTERESTS_TABLE,
} from "./sales-hub";

export type AirtableDmLead = {
  id: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  interest: string;     // resolved Primary Interest name(s)
  note: string;         // Automated Notes (free text)
  status: string;       // DM Status (Pending / In Progress / Follow up / Converted to Lead / …)
  lastMod: string | null;   // friendly IST string, e.g. "20 Feb · 6:47 pm"
  counsellor: string;
  airtableUrl: string;
};

// Primary Interest is a link field → Airtable returns record IDs. Resolve them to
// names via the small "DB: Primary Interests" table, cached for the process.
let interestCache: Map<string, string> | null = null;
async function interestMap(): Promise<Map<string, string>> {
  if (interestCache) return interestCache;
  const rows = await airtableList<{ Particulars?: string }>(PRIMARY_INTERESTS_TABLE, {
    fields: ["Particulars"],
    maxRecords: 500,
  });
  interestCache = new Map(rows.map((r) => [r.id, r.fields.Particulars || ""]));
  return interestCache;
}

function friendlyIST(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      hour12: true, timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return null;
  }
}

export async function getAirtableDmLeads(limit = 60): Promise<AirtableDmLead[]> {
  const recs = await airtableList<Record<string, unknown>>(DM_LEADS_TABLE, {
    fields: ["First Name", "Last Name", "Phone", "Email", "DM Status", "Counsellor", "Last Modified", "Primary Interest", "Automated Notes"],
    sort: [{ field: "Last Modified", direction: "desc" }],
    maxRecords: limit,
    pageSize: Math.min(limit, 100),
  });

  const imap = await interestMap().catch(() => new Map<string, string>());

  return recs.map((r) => {
    const f = r.fields;
    const interestIds = Array.isArray(f["Primary Interest"]) ? (f["Primary Interest"] as string[]) : [];
    const interest = interestIds.map((id) => imap.get(id) || "").filter(Boolean).join(", ");
    return {
      id: r.id,
      first: String(f["First Name"] || ""),
      last: String(f["Last Name"] || ""),
      email: String(f["Email"] || ""),
      phone: f["Phone"] != null ? String(f["Phone"]) : "",
      interest,
      note: String(f["Automated Notes"] || ""),
      status: typeof f["DM Status"] === "string" ? (f["DM Status"] as string) : pickName(f["DM Status"]),
      lastMod: friendlyIST(f["Last Modified"] as string | undefined),
      counsellor: pickName(f["Counsellor"]),
      airtableUrl: `https://airtable.com/${SALES_HUB_BASE}/${DM_LEADS_TABLE}/${r.id}`,
    };
  });
}
