// Search layer for the internal "Ask GooCampus" tool — NO AI, NO external API.
//
// It's a plain, deterministic search over this dashboard's own data (Supabase
// mh_posts + the saved-reports store). Nothing reaches the internet and there is
// no model, so results are exact and free. Each result carries its own actions:
// an "Open" link (opens the item directly) and a "View in tab" link (the section
// it lives in).

import { getSupabase } from "@/lib/supabase";
import { listReports } from "@/lib/report-store";
import { airtableList, CRM_TABLE, SALES_HUB_BASE, pickName } from "@/lib/sales-hub";

const HUB = "/dashboard/preview";

export type SearchResult = {
  id: string;                 // "post:<uuid>" | "report:<key>" | "lead:<recId>"
  kind: "post" | "report" | "lead";
  group: string;              // section header in the UI
  title: string;
  meta: string;               // short context line
  openHref: string | null;    // direct open (live link / inline report); null = none
  openLabel: string;
  tabHref: string;            // the dashboard section it lives in
  tabLabel: string;
};

const STOPWORDS = new Set([
  "the", "and", "for", "our", "you", "your", "what", "which", "where", "when", "who", "how",
  "was", "were", "did", "does", "with", "about", "from", "into", "that", "this", "there",
  "have", "has", "had", "any", "all", "show", "me", "find", "get", "tell", "give", "link",
  "links", "please", "can", "could", "would", "is", "it", "of", "in", "on",
  "a", "an", "to", "do", "we", "us", "i", "my", "are", "as", "by", "or", "at", "report", "reports",
  // contact-lookup filler so a "phone number for <name>" query keys on the name
  "phone", "number", "numbers", "contact", "details", "detail", "call", "whatsapp", "mobile", "lead",
]);

// Pull meaningful search terms out of a natural-language question.
export function keywords(question: string): string[] {
  const words = (question.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 8);
}

// First real link on a post, in priority order — or null if it has none yet.
function postLink(p: Record<string, unknown>): string | null {
  const cands = [p.instagram_url, p.facebook_url, p.linkedin_url, p.output_link, p.external_link];
  for (const c of cands) if (typeof c === "string" && /^https?:\/\//.test(c)) return c;
  return null;
}

function snippet(s: unknown, n = 90): string {
  if (typeof s !== "string") return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// Search posts/content/tasks in mh_posts across title, caption, content, notes
// and owner.
async function searchPosts(terms: string[]): Promise<SearchResult[]> {
  const db = getSupabase();
  if (!db || terms.length === 0) return [];
  // owner_key holds the lowercase first name ("praveen", "manya", …), which is
  // exactly what keywords() produces, so a teammate's name matches directly and
  // no name-to-key lookup is needed here. Without it, searching a person found
  // nothing: only a task's own text was ever indexed, never who it belongs to.
  const cols = ["particulars", "caption", "content", "additional_info", "sbu", "type", "owner_key"];
  // keywords() already strips terms to [a-z0-9], so the or-filter can't be broken.
  const or = terms.flatMap((t) => cols.map((c) => `${c}.ilike.%${t}%`)).join(",");
  const { data } = await db
    .from("mh_posts")
    .select("id, particulars, type, status, sbu, owner_key, caption, content, publishing_date, output_link, instagram_url, facebook_url, linkedin_url, external_link")
    .or(or)
    .order("publishing_date", { ascending: false, nullsFirst: false })
    .limit(20);
  return (data || []).map((p) => {
    const link = postLink(p);
    // Capitalised from the key rather than imported from the my-day route's
    // OWNER_NAME map — the keys ARE the first names, so this avoids lib/
    // depending on an app/api/ route just to title-case one word.
    const owner = typeof p.owner_key === "string" && p.owner_key
      ? p.owner_key.charAt(0).toUpperCase() + p.owner_key.slice(1)
      : "";
    const meta = [p.type, p.status, p.sbu, owner && `owned by ${owner}`, p.publishing_date, snippet(p.caption || p.content)]
      .filter(Boolean).join(" · ");
    return {
      id: `post:${p.id}`,
      kind: "post" as const,
      group: "Content & tasks",
      title: (typeof p.particulars === "string" && p.particulars) || "Untitled post",
      meta,
      openHref: link,                                   // opens the live post if published
      openLabel: "Open link",
      tabHref: `${HUB}/marketing-hub?tab=master`,       // where the item is managed
      tabLabel: "View in Marketing Hub",
    };
  });
}

// Search the saved-reports archive by platform / period / account keywords.
async function searchReports(terms: string[]): Promise<SearchResult[]> {
  if (terms.length === 0) return [];
  const all = await listReports();
  const t = new Set(terms);
  // Month names → so "July report" matches a monthly report whose window is in July.
  const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const wantedMonths = terms.filter((k) => MONTHS.includes(k));
  const hits = all.filter((r) => {
    if (t.has(r.platform) || t.has(r.period)) return true;
    if (terms.some((k) => (r.account || "").toLowerCase().includes(k))) return true;
    if (wantedMonths.length) {
      const m = MONTHS[Number((r.to || "").slice(5, 7)) - 1] || "";
      if (wantedMonths.includes(m)) return true;
    }
    return false;
  });
  return hits.slice(0, 10).map((r) => ({
    id: `report:${r.key}`,
    kind: "report" as const,
    group: "Reports",
    title: `${r.platform} ${r.period} report — @${r.account}`,
    meta: `window ${r.from} → ${r.to}`,
    openHref: `${HUB}/reports/social?platform=${r.platform}&open=${encodeURIComponent(r.key)}`,
    openLabel: "Open report",
    tabHref: `${HUB}/reports/social?platform=${r.platform}`,
    tabLabel: "View in Reports",
  }));
}

// Search CRM leads by name (or phone digits) — this is the ONLY thing that reads
// Airtable (the Sales Hub base, where contact numbers live and stay). Airtable
// filters server-side, so we pull just the matches, never the 30k table. Failures
// degrade to no lead results rather than breaking the whole search.
async function searchLeads(terms: string[]): Promise<SearchResult[]> {
  if (terms.length === 0 || !process.env.AIRTABLE_API_KEY) return [];
  // Only chase names/phones — 1–2 char or purely-generic terms make bad lead hits.
  const useful = terms.filter((t) => t.length >= 3);
  if (useful.length === 0) return [];
  const conds = useful.map((t) =>
    /^\d+$/.test(t) ? `FIND('${t}', {Mobile Number} & '')` : `FIND('${t}', LOWER({Full Name}))`,
  );
  const formula = `OR(${conds.join(",")})`;
  try {
    const rows = await airtableList<Record<string, unknown>>(CRM_TABLE, {
      filterByFormula: formula,
      fields: ["Full Name", "Mobile Number", "Email", "Counsellor", "Lead Source (n8n)"],
      maxRecords: 12,
    });
    return rows.map((r) => {
      const name = pickName(r.fields["Full Name"]) || "Unnamed lead";
      const phone = pickName(r.fields["Mobile Number"]);
      const counsellor = pickName(r.fields["Counsellor"]);
      const source = pickName(r.fields["Lead Source (n8n)"]);
      const meta = [phone && `📞 ${phone}`, counsellor && `counsellor: ${counsellor}`, source]
        .filter(Boolean).join(" · ");
      return {
        id: `lead:${r.id}`,
        kind: "lead" as const,
        group: "Leads (Sales Hub)",
        title: name,
        meta: meta || "no phone on record",
        openHref: phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null,
        openLabel: "Call",
        tabHref: `https://airtable.com/${SALES_HUB_BASE}/${CRM_TABLE}/${r.id}`,
        tabLabel: "Open in Sales Hub",
      };
    });
  } catch {
    return [];
  }
}

// Everything matching the query — leads (phone numbers) first, then reports, then
// content. Runs the three sources in parallel.
export async function search(question: string): Promise<SearchResult[]> {
  const terms = keywords(question);
  const [leads, reports, posts] = await Promise.all([
    searchLeads(terms), searchReports(terms), searchPosts(terms),
  ]);
  return [...leads, ...reports, ...posts];
}
