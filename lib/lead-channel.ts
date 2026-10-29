// Marketing Leads — DM leads only (docs/MARKETING_LEADS_SPEC.md). Pure helpers for the page.

/** The two CRM "Lead Source (n8n)" values that are DM leads. Paid leads are in Campaigns. */
export const DM_SOURCES = [
  { key: "dm", source: "Instagram/Facebook DMs", label: "Instagram / Facebook DMs", short: "IG / FB DM", color: "#1AA053" },
  { key: "booking", source: "DM Booking", label: "DM Booking", short: "DM Booking", color: "#3A57E8" },
] as const;

/** "Hot lead" / "Interested" statuses — not "Not interested". */
export const isWarm = (status: string) => /hot|interested/i.test(status) && !/not interested/i.test(status);
/** In a real conversation — same set as Sales Hub's follow-up card. */
export const TALKING = new Set(["Initial discussions", "Hot lead", "Interested", "Bookings", "Re-Enquiry", "Future prospect", "Qualified", "Negotiation", "Payment pending", "Closed won"]);
