// Read-only mirror of the Sales Hub → "DM Leads" table (tbl8CpgnQSYcbFKEH) for the
// dashboard Inbox. Pulls the real Instagram DM leads with their DM Status, Counsellor,
// last-activity time and Primary Interest, and builds a deep-link back to each record.
//
// NO WRITES. Uses the read-only airtableList() client (see lib/sales-hub.ts — the base
// has ~1.6k DM leads and a 30k-row CRM with no backup). Pushing new leads INTO Airtable
// is a separate, explicitly-gated step and is intentionally not done here.

import {
  airtableList, pickName, SALES_HUB_BASE, DM_LEADS_TABLE, PRIMARY_INTERESTS_TABLE, CRM_TABLE,
} from "./sales-hub";

export type AirtableDmLead = {
  id: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  interest: string;     // resolved Primary Interest name(s)
  note: string;         // Automated Notes (free text)
  status: string;       // DM Status, or the richer CRM Lead Status once converted
  converted: boolean;   // matched to a CRM record (status is the CRM Lead Status)
  lastMod: string | null;   // friendly IST string, e.g. "20 Feb · 6:47 pm"
  counsellor: string;
  airtableUrl: string;  // CRM record when converted, else the DM Leads record
};

const phone10 = (v: string): string => {
  const d = (v || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
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

// Join to the CRM table by 10-digit phone → the richer "Lead Status" (Hot lead /
// Junk lead / Re-Enquiry / Closed won …) plus a link to the CRM record. A DM lead
// that's been "Converted to Lead" has a matching CRM row; latest match wins. Best-
// effort: any failure just leaves the lead on its DM Status.
async function crmStatusByPhone(phones: string[]): Promise<Map<string, { status: string; url: string }>> {
  const map = new Map<string, { status: string; url: string }>();
  const uniq = [...new Set(phones.filter((p) => /^\d{10}$/.test(p)))];
  if (!uniq.length) return map;
  // phones are validated 10-digit strings → safe to inline in the formula.
  const formula = `OR(${uniq.map((p) => `{Raw 10-Digit Number}='${p}'`).join(",")})`;
  const recs = await airtableList<Record<string, unknown>>(CRM_TABLE, {
    fields: ["Raw 10-Digit Number", "Lead Status", "Link to Record"],
    filterByFormula: formula,
    sort: [{ field: "Actual Last Modified", direction: "desc" }],
    maxRecords: 400,
    pageSize: 100,
  });
  for (const r of recs) {
    const p = phone10(String(r.fields["Raw 10-Digit Number"] || ""));
    if (!p || map.has(p)) continue; // sorted latest-first → first match is newest
    const status = typeof r.fields["Lead Status"] === "string" ? (r.fields["Lead Status"] as string) : pickName(r.fields["Lead Status"]);
    if (!status) continue;
    const url = String(r.fields["Link to Record"] || "") || `https://airtable.com/${SALES_HUB_BASE}/${CRM_TABLE}/${r.id}`;
    map.set(p, { status, url });
  }
  return map;
}

export async function getAirtableDmLeads(limit = 60): Promise<AirtableDmLead[]> {
  const recs = await airtableList<Record<string, unknown>>(DM_LEADS_TABLE, {
    fields: ["First Name", "Last Name", "Phone", "Email", "DM Status", "Counsellor", "Last Modified", "Primary Interest", "Automated Notes"],
    sort: [{ field: "Last Modified", direction: "desc" }],
    maxRecords: limit,
    pageSize: Math.min(limit, 100),
  });

  const imap = await interestMap().catch(() => new Map<string, string>());

  const base: AirtableDmLead[] = recs.map((r) => {
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
      converted: false,
      lastMod: friendlyIST(f["Last Modified"] as string | undefined),
      counsellor: pickName(f["Counsellor"]),
      airtableUrl: `https://airtable.com/${SALES_HUB_BASE}/${DM_LEADS_TABLE}/${r.id}`,
    };
  });

  // Overlay the richer CRM Lead Status where the lead has been converted.
  const crm = await crmStatusByPhone(base.map((l) => phone10(l.phone))).catch(() => new Map<string, { status: string; url: string }>());
  if (!crm.size) return base;
  return base.map((l) => {
    const c = crm.get(phone10(l.phone));
    return c ? { ...l, status: c.status, converted: true, airtableUrl: c.url } : l;
  });
}
