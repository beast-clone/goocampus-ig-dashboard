// Marketing Leads — which CRM lead sources the page shows as tabs (docs/MARKETING_LEADS_SPEC.md).
// The real list is saved by an admin (/api/leads/source-tabs); these are the starting values.

/** A tab = one CRM "Lead Source (n8n)" value, with the name shown on the page. */
export type SourceTab = { source: string; label: string };
export type SourceSetup = { tabs: SourceTab[]; hidden: string[] };

/** DM leads only — the non-paid leads (29 Oct). */
export const DEFAULT_TABS: SourceTab[] = [
  { source: "Instagram/Facebook DMs", label: "Instagram / Facebook DMs" },
  { source: "DM Booking", label: "DM Booking" },
];
/** Sources Praveen chose not to show here (paid ads, and non-DM leads) — never flagged as "new". */
export const DEFAULT_HIDDEN = ["Digital marketing activity", "YouTube", "Website", "Bookings", ""];

/** "Hot lead" / "Interested" statuses — not "Not interested". */
export const isWarm = (status: string) => /hot|interested/i.test(status) && !/not interested/i.test(status);
/** In a real conversation — same set as Sales Hub's follow-up card. */
export const TALKING = new Set(["Initial discussions", "Hot lead", "Interested", "Bookings", "Re-Enquiry", "Future prospect", "Qualified", "Negotiation", "Payment pending", "Closed won"]);
