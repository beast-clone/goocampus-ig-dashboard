// Marketing Leads — which brand and which channel a CRM lead belongs to
// (docs/MARKETING_LEADS_SPEC.md). Pure functions, used by the page and the matches API.

/** Channels, from the CRM's "Lead Source (n8n)". Anything unknown is "Other". */
export const CHANNELS = [
  { key: "ads", label: "Ads & lead forms", short: "Ads", color: "#3A57E8", sources: ["Digital marketing activity"] },
  { key: "dm", label: "Instagram / Facebook DMs", short: "IG / FB DMs", color: "#1AA053", sources: ["Instagram/Facebook DMs", "DM Booking"] },
  { key: "yt", label: "YouTube", short: "YouTube", color: "#C03221", sources: ["YouTube"] },
  { key: "web", label: "Website", short: "Website", color: "#F16A1B", sources: ["Website"] },
  { key: "book", label: "Bookings", short: "Bookings", color: "#2138B0", sources: ["Bookings"] },
  { key: "other", label: "Other", short: "Other", color: "#8A92A6", sources: [] as string[] },
] as const;
export type ChannelKey = (typeof CHANNELS)[number]["key"];
export const channelOf = (source: string): ChannelKey =>
  (CHANNELS.find((c) => (c.sources as readonly string[]).includes(source)) ?? CHANNELS[CHANNELS.length - 1]).key;

/** Brand-list entries that are content buckets, not something a lead can be interested in. */
const NOT_A_PRODUCT = /^(general content|special days)$/i;
export const leadBrands = (sbus: string[]) => sbus.filter((b) => !NOT_A_PRODUCT.test(b));

/** Interest key: lowercase, punctuation and the word "program(me)" ignored. */
export const interestKey = (s: string) =>
  (s || "").toLowerCase().replace(/\bprogram(me)?s?\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Interests that mean "none given" — they can't be matched, only fixed in the CRM. */
export const isBlankInterest = (key: string) => !key || key === "unverified interest";

/** Built-in matches the names can't find on their own. A saved match overrides these. */
export const DEFAULT_MATCHES: Record<string, string> = { "united arab emirates": "Middle East" };

/**
 * The brand for a lead's Primary Interest, or null ("No brand yet"):
 *   1. a saved match (an admin picked a brand once; "" = deliberately none),
 *   2. the same name as a brand,
 *   3. exactly one brand whose name contains the interest, or the other way round.
 */
export function brandFor(interest: string, brands: string[], matches: Record<string, string>): string | null {
  const k = interestKey(interest);
  if (isBlankInterest(k)) return null;
  const saved = k in matches ? matches[k] : DEFAULT_MATCHES[k];
  if (saved !== undefined) return brands.includes(saved) ? saved : null;
  const same = brands.find((b) => interestKey(b) === k);
  if (same) return same;
  const fits = brands.filter((b) => { const bk = interestKey(b); return bk.length >= 4 && (k.includes(bk) || bk.includes(k)); });
  return fits.length === 1 ? fits[0] : null;
}

/** "Hot lead" / "Interested" statuses — not "Not interested". */
export const isWarm = (status: string) => /hot|interested/i.test(status) && !/not interested/i.test(status);
/** In a real conversation — same set as Sales Hub's follow-up card. */
export const TALKING = new Set(["Initial discussions", "Hot lead", "Interested", "Bookings", "Re-Enquiry", "Future prospect", "Qualified", "Negotiation", "Payment pending", "Closed won"]);
