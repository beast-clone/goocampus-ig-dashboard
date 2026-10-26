// One-time copy of seven Airtable Marketing Hub tables into the dashboard's Marketing
// Materials tabs (Praveen, 23 Oct 2026). After this the team works in the dashboard only.
//
//   node scripts/import-marketing-materials.mjs            (all six)
//   node scripts/import-marketing-materials.mjs expenses   (one table)
//
// Safe to run again: rows are matched on airtable_id, and a file already copied is
// not uploaded twice. Files go to storage (scheduler-media/materials/…) because
// Airtable's file links expire after a few hours. Card numbers: only the last 4 digits
// are kept.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = "appLdJFTrothBLDc0", BUCKET = "scheduler-media";

async function airtable(table) {
  let out = [], offset;
  do {
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${table}?pageSize=100${offset ? `&offset=${offset}` : ""}`, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
    if (!r.ok) throw new Error(`Airtable ${table}: ${r.status} ${await r.text()}`);
    const d = await r.json();
    out = out.concat(d.records); offset = d.offset;
  } while (offset);
  return out;
}

const safe = (n) => n.replace(/[^\w.\-]+/g, "_").slice(-120);
async function copyFiles(list, folder) {
  const out = [];
  for (const a of list || []) {
    const path = `materials/${folder}/${a.id}-${safe(a.filename || "file")}`;
    const pub = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const head = await fetch(pub, { method: "HEAD" });
    if (!head.ok) {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`download ${a.filename}: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: a.type || "application/octet-stream", upsert: true });
      if (error) throw new Error(`upload ${a.filename}: ${error.message}`);
    }
    out.push({ url: pub, name: a.filename || "file", mime: a.type || "", size: a.size || 0, ...(a.width ? { width: a.width, height: a.height } : {}) });
  }
  return out;
}

const day = (s) => (s ? String(s).slice(0, 10) : null);
const text = (s) => (typeof s === "string" ? s.trim() : s ?? null) || null;

const TABLES = {
  expenses: { at: "tblIdJVbkphAu3lo6", to: "mm_expenses", row: async (f, id) => ({
    title: text(f["Particulars"]) || "", description: text(f["Description"]), sbus: f["SBU(s)"] || [],
    expense_date: day(f["Expense Date"]), amount: f["Amount"] ?? null, owner: f["Owner"]?.name || null,
    card_last4: (String(f["Payment Method"] || "").match(/(\d{4})\D*$/) || [])[1] || null,
    files: await copyFiles(f["Receipt"], `expenses/${id}`),
  }) },
  photos: { at: "tbltvhvgQeeoYB1ww", to: "mm_photos", row: async (f, id) => ({
    title: text(f["Particulars"]) || "", description: text(f["Description"]),
    non_usable: !!f["Non-Usable"], design_files: !!f["Design Files"],
    files: await copyFiles(f["Photo"], `photos/${id}`),
  }) },
  materials: { at: "tbl9f2a2JwVIPK5W2", to: "mm_materials", row: async (f, id) => ({
    title: text(f["Particulars"]) || "", country: text(f["Country"]), education_level: text(f["Education Level"]),
    dimensions: text(f["Dimensions"]), kind: text(f["Type"]),
    files: await copyFiles(f["File"], `materials/${id}`),
    updated_at: f["Last Modified"] || new Date().toISOString(),
  }) },
  promotions: { at: "tblgHOxpjufrZIaRe", to: "mm_promotions", row: async (f, id) => ({
    title: text(f["Particulars"]) || "", start_date: day(f["Start Date"]), interest: text(f["Primary Interest"]),
    spend: f["Spend"] ?? null, files: await copyFiles(f["Attachment"], `promotions/${id}`),
  }) },
  subscriptions: { at: "tbl9pHcUMTIUpZ3qI", to: "mm_subscriptions", row: async (f) => ({
    title: text(f["Particulars"]) || "", description: text(f["Description"]), teams: f["Team(s)"] || [],
    amount: f["Amount"] ?? null, status: text(f["Status"]), frequency: text(f["Frequency"]), billing: text(f["Billing"]),
  }) },
  meetings: { at: "tblHKqtrZVobK1apj", to: "mm_meetings", row: async (f, _id, people) => ({
    title: text(f["Particulars"]) || "", meeting_date: day(f["Date"]),
    attendees: (f["Email List"] || []).map((r) => people.get(r)).filter(Boolean),
    minutes: typeof f["Minutes of Meeting"] === "string" ? f["Minutes of Meeting"].trim() || null : null,
    cross_functional: f["Cross Functional?"] === "Yes",
  }) },
  // eBook Orders (26 Oct): the Australia and NZ sales logged before the n8n workflows
  // switched to the dashboard. Run on its own: node scripts/import-marketing-materials.mjs ebooks
  ebooks: { at: "tblDDCWiBZyIsXjca", to: "mm_ebook_orders", row: async (f, _id, _p, created) => ({
    title: [text(f["First Name"]), text(f["Last Name"])].filter(Boolean).join(" "),
    ebook: { "AMC E Book": "Australia", "New Zealand E Book": "New Zealand" }[f["Service"]] || text(f["Service"]),
    order_date: day(created), paid_at: created, amount: f["Amount"] ?? null, status: text(f["Status"]),
    email: text(f["Email ID"]), phone: text(f["Phone"]), payment_mode: text(f["Payment Mode"]),
    payment_id: text(f["Payment ID"]), error_reason: text(f["Error Reason"]),
    access_shared: String(f["Access Shared"] || "").trim() === "Yes", email_sent_at: f["Email Sent"] || null,
  }) },
};

const only = process.argv[2];
let people = new Map();
if (!only || only === "meetings") {
  for (const r of await airtable("tblTqSAlYkhwzHXe8")) people.set(r.id, r.fields["Full Name"] || r.fields["Email"] || r.fields["Name"]);
}
for (const [name, t] of Object.entries(TABLES)) {
  if (only && only !== name) continue;
  const recs = await airtable(t.at);
  let n = 0;
  const rows = [];
  for (const r of recs) {
    const row = { ...(await t.row(r.fields, r.id, people, r.createdTime)), airtable_id: r.id, created_at: r.createdTime, created_by: "airtable" };
    rows.push(row);
    if (++n % 10 === 0) process.stdout.write(`\r${name}: ${n}/${recs.length}`);
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from(t.to).upsert(rows.slice(i, i + 200), { onConflict: "airtable_id" });
    if (error) throw new Error(`${t.to}: ${error.message}`);
  }
  console.log(`\r${name}: ${rows.length} rows copied`);
}
