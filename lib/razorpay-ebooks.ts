// eBook orders straight from Razorpay (28 Oct). The n8n automations only log a sale
// from the day they went live, so older sales were missing from the eBook Orders tab
// (Australia showed 17; Razorpay's own page count is 67). This reads every payment
// on the account and keeps the eBook ones.
//
// Which payment is which eBook:
//   - notes.product ("Australia Ebook", "New Zealand Ebook", …) — set by the eBook
//     pages' Product dropdown;
//   - before that dropdown existed, only the Australia page sold: its payments carry
//     exactly first_name/last_name/email/phone and were ₹899 or ₹999 plus fees. This
//     rule gives 67 Australia sales, the same as Razorpay's count for the page.
// ₹1 test payments are left out.
import { getSupabase } from "@/lib/supabase";
import { MTABS } from "@/lib/materials";

type Payment = {
  id: string; amount: number; status: string; method?: string; created_at: number;
  email?: string; contact?: string; error_description?: string | null;
  notes?: Record<string, string> | unknown[];
};

const PRODUCT: [RegExp, string][] = [
  [/australia/i, "Australia"], [/zealand/i, "New Zealand"], [/canada/i, "Canada"], [/germany/i, "Germany"],
  [/india|neet/i, "India (NEET-PG)"], [/ireland/i, "Ireland"], [/qatar/i, "Qatar"], [/saudi/i, "Saudi Arabia"], [/uae|emirates/i, "UAE"],
];
const AU_PAGE_SINCE = 1762410413;                                   // "The Complete Australia Pathway Blueprint" created
const AU_LEGACY_AMOUNTS = new Set([91698, 92022, 92597, 101898, 102258, 102897]); // ₹899 / ₹999 + fees, in paise
const STATUS: Record<string, string> = { captured: "Paid", refunded: "Refunded", failed: "Failed" };
const MODE: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet", emi: "EMI" };

// eBooks added on the page (28 Oct) live in mh_settings "ebookTitles"; the built-in
// nine come from the tab's field options.
const BUILT_IN = MTABS.find((t) => t.key === "ebooks")!.fields.find((f) => f.key === "ebook")!.options || [];
async function addedTitles(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("mh_settings").select("value").eq("key", "ebookTitles").maybeSingle();
  return Array.isArray(data?.value) ? (data!.value as unknown[]).filter((x): x is string => typeof x === "string") : [];
}
export async function ebookTitles(): Promise<string[]> {
  return [...new Set([...BUILT_IN, ...(await addedTitles())])];
}
export async function addEbookTitle(raw: string, by: string | null): Promise<string[]> {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) throw new Error("Give the eBook a name (2–60 letters).");
  const all = await ebookTitles();
  if (all.some((t) => t.toLowerCase() === name.toLowerCase())) throw new Error(`"${name}" is already in the list.`);
  const sb = getSupabase();
  if (!sb) throw new Error("Database not configured");
  const { error } = await sb.from("mh_settings").upsert({ key: "ebookTitles", value: [...(await addedTitles()), name], updated_at: new Date().toISOString(), updated_by: by });
  if (error) throw new Error(error.message);
  return [...all, name];
}

function ebookOf(p: Payment, added: string[]): string | null {
  if (p.amount < 1000) return null;                                 // ₹1 tests
  const n = (p.notes && !Array.isArray(p.notes) ? p.notes : {}) as Record<string, string>;
  // A new eBook is picked up when its page's Product says its name ("Japan Ebook").
  if (n.product) return PRODUCT.find(([re]) => re.test(n.product))?.[1] ?? added.find((t) => n.product.toLowerCase().includes(t.toLowerCase())) ?? null;
  const keys = Object.keys(n).sort().join(",");
  if (p.created_at >= AU_PAGE_SINCE && keys === "email,first_name,last_name,phone" && AU_LEGACY_AMOUNTS.has(p.amount)) return "Australia";
  return null;
}

async function fetchPayments(since: number): Promise<Payment[]> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const out: Payment[] = [];
  for (let skip = 0; skip < 20000; skip += 100) {
    const r = await fetch(`https://api.razorpay.com/v1/payments?count=100&skip=${skip}&from=${since}`, { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
    const j = await r.json().catch(() => null) as { items?: Payment[]; error?: { description?: string } } | null;
    if (!r.ok || !j?.items) throw new Error(j?.error?.description || `Razorpay answered ${r.status}`);
    out.push(...j.items);
    if (j.items.length < 100) break;
  }
  return out;
}

/** Add every missing eBook payment; refresh status/amount on ones already there. */
export async function syncEbookOrders() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) throw new Error("Razorpay isn't connected (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).");
  const sb = getSupabase();
  if (!sb) throw new Error("Database not configured");
  const payments = (await fetchPayments(AU_PAGE_SINCE - 86400)).filter((p) => STATUS[p.status]);
  const added = await addedTitles();
  const rows = payments.map((p) => ({ p, ebook: ebookOf(p, added) })).filter((x): x is { p: Payment; ebook: string } => !!x.ebook).map(({ p, ebook }) => {
    const n = (p.notes && !Array.isArray(p.notes) ? p.notes : {}) as Record<string, string>;
    const at = new Date(p.created_at * 1000);
    return {
      payment_id: p.id, ebook,
      title: (n.full_name || [n.first_name, n.last_name].filter(Boolean).join(" ") || n.email || p.email || "").trim(),
      order_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at),
      paid_at: at.toISOString(), amount: p.amount / 100, status: STATUS[p.status],
      email: n.email || p.email || null, phone: (n.phone || p.contact || "").replace(/\D/g, "") || null,
      payment_mode: MODE[p.method || ""] || p.method || null, error_reason: p.error_description || null,
    };
  });
  const { data: have, error } = await sb.from("mm_ebook_orders").select("id, payment_id, status, amount").not("payment_id", "is", null);
  if (error) throw error;
  const byPay = new Map((have || []).map((h) => [h.payment_id as string, h]));
  const fresh = rows.filter((r) => !byPay.has(r.payment_id)).map((r) => ({ ...r, access_shared: null, created_by: "razorpay" }));
  for (let i = 0; i < fresh.length; i += 200) {
    const { error: e } = await sb.from("mm_ebook_orders").insert(fresh.slice(i, i + 200));
    if (e) throw e;
  }
  let updated = 0;
  for (const r of rows) {
    const h = byPay.get(r.payment_id);
    if (h && (h.status !== r.status || Number(h.amount) !== r.amount)) {
      await sb.from("mm_ebook_orders").update({ status: r.status, amount: r.amount, error_reason: r.error_reason }).eq("id", h.id);
      updated++;
    }
  }
  const byEbook: Record<string, { paid: number; added: number }> = {};
  for (const r of rows) { const b = (byEbook[r.ebook] ||= { paid: 0, added: 0 }); if (r.status === "Paid") b.paid++; }
  for (const r of fresh) byEbook[r.ebook].added++;
  return { checked: payments.length, ebookPayments: rows.length, added: fresh.length, updated, byEbook };
}
