// Sidebar "Marketing Hub" (Praveen, 23 Oct 2026): tabs copied from the Airtable
// Marketing Hub base (scripts/import-marketing-materials.mjs) and edited here only.
// Meetings was copied too (mm_meetings, 607 rows kept) but taken off the sidebar the
// same day at Praveen's request.
// One description per tab drives both the API (which columns may be written) and the
// page (table columns, the edit window, totals). Tables: sql/marketing_materials.sql.

export type FieldType = "text" | "longtext" | "date" | "money" | "select" | "multi" | "bool" | "files";
export type MField = {
  key: string; label: string; type: FieldType;
  /** Shown as a table column (the title always is). */
  col?: boolean;
  /** Choices to offer; values already used on the tab are offered too. */
  options?: string[];
};
export type MTabKey = "expenses" | "photos" | "materials" | "promotions" | "subscriptions" | "ebooks";
export type MTab = {
  key: MTabKey; label: string; table: string; intro: string;
  /** Item word for buttons and counts ("Add expense", "26 expenses"). */
  noun: string; nounPlural: string;
  sort: { col: string; asc: boolean };
  /** Picture grid instead of a table. */
  grid?: boolean;
  /** Each row is a folder of files, opened like a folder on a computer. */
  folders?: boolean;
  /** Grid / List switch, and a click opens the file large on the right. */
  viewer?: boolean;
  /** Date column for the month filter / totals, and the money column to add up. */
  date?: string; money?: string;
  fields: MField[];
};

// The nine country eBooks sold on Razorpay (Praveen, 26 Oct 2026). The n8n sale
// workflows write the same names, so the filter chips line up.
const EBOOKS = ["Australia", "New Zealand", "Canada", "Germany", "India (NEET-PG)", "Ireland", "Qatar", "Saudi Arabia", "UAE"];

const TEAMS = ["Marketing", "Operations", "Sales", "Administration", "Mentorship Platform", "India Admissions"];

export const MTABS: MTab[] = [
  { key: "expenses", label: "Expenses", table: "mm_expenses", noun: "expense", nounPlural: "expenses",
    intro: "What the marketing team spends — tools, subscriptions, recharges — with the receipt for each.",
    sort: { col: "expense_date", asc: false }, date: "expense_date", money: "amount",
    fields: [
      { key: "title", label: "Particulars", type: "text" },
      { key: "description", label: "Description", type: "text", col: true },
      { key: "expense_date", label: "Date", type: "date", col: true },
      { key: "amount", label: "Amount", type: "money", col: true },
      { key: "sbus", label: "Brand", type: "multi", col: true },
      { key: "owner", label: "Paid by", type: "select", col: true },
      { key: "card_last4", label: "Card (last 4 digits)", type: "text" },
      { key: "files", label: "Receipt", type: "files", col: true },
    ] },
  // Folders, like on a computer (Praveen, 23 Oct): each row is a folder of photos.
  { key: "photos", label: "Essential Photos", table: "mm_photos", noun: "folder", nounPlural: "folders", grid: true, folders: true,
    intro: "Event photos, campus shots and logo files the team reuses in designs — one folder per event or set.",
    sort: { col: "created_at", asc: false },
    fields: [
      { key: "title", label: "Name", type: "text" },
      { key: "files", label: "Photos", type: "files" },
      { key: "description", label: "Description", type: "longtext" },
      { key: "design_files", label: "Design files", type: "bool" },
      { key: "non_usable", label: "Not usable", type: "bool" },
    ] },
  { key: "materials", label: "Marketing Material", table: "mm_materials", noun: "material", nounPlural: "materials", grid: true, viewer: true,
    intro: "Brochures and flyers for every university and programme, by country and level.",
    sort: { col: "title", asc: true },
    fields: [
      { key: "title", label: "Name", type: "text" },
      { key: "files", label: "File", type: "files" },
      { key: "country", label: "Country", type: "select", col: true },
      { key: "education_level", label: "Level", type: "select", col: true, options: ["Under-graduate", "Post-graduate"] },
      { key: "kind", label: "Type", type: "select", options: ["Mobile-First", "Print"] },
      { key: "dimensions", label: "Size", type: "text" },
      // So anyone can tell the final file from the working one (Praveen, 23 Oct).
      { key: "version", label: "Version", type: "select", col: true, options: ["Final", "Needs update"] },
      { key: "source_url", label: "Editable source (Canva link)", type: "text" },
    ] },
  { key: "promotions", label: "Paid Promotions", table: "mm_promotions", noun: "promotion", nounPlural: "promotions",
    intro: "Boosted posts and influencer spends, with what each one cost.",
    sort: { col: "start_date", asc: false }, date: "start_date", money: "spend",
    fields: [
      { key: "title", label: "Particulars", type: "text" },
      { key: "start_date", label: "Start date", type: "date", col: true },
      { key: "interest", label: "Brand", type: "select", col: true },
      { key: "spend", label: "Spend", type: "money", col: true },
      { key: "files", label: "Attachment", type: "files", col: true },
    ] },
  { key: "subscriptions", label: "Subscriptions", table: "mm_subscriptions", noun: "subscription", nounPlural: "subscriptions",
    intro: "Every tool the company pays for, who pays for it and whether it's still in use.",
    sort: { col: "title", asc: true }, money: "amount",
    fields: [
      { key: "title", label: "Tool", type: "text" },
      { key: "description", label: "Description", type: "text", col: true },
      { key: "teams", label: "Teams", type: "multi", col: true, options: TEAMS },
      { key: "frequency", label: "Billed", type: "select", col: true, options: ["Monthly", "Annual", "One-Time", "Irregular"] },
      { key: "amount", label: "Amount", type: "money", col: true },
      { key: "billing", label: "Paid by", type: "select", col: true },
      { key: "status", label: "Status", type: "select", col: true, options: ["Still in use", "Discontinued"] },
    ] },
  // eBook sales (Praveen, 26 Oct 2026): written by the n8n Razorpay workflows, one per
  // eBook, instead of the Airtable "E Book Orders" table. Paid and failed payments both
  // land here; payment_id is unique so a repeated Razorpay webhook updates the same row.
  { key: "ebooks", label: "eBook Orders", table: "mm_ebook_orders", noun: "order", nounPlural: "orders",
    intro: "Every eBook payment from Razorpay — who bought which eBook, whether it went through and whether the Drive folder was shared.",
    sort: { col: "paid_at", asc: false }, date: "order_date", money: "amount",
    fields: [
      { key: "title", label: "Buyer", type: "text" },
      { key: "ebook", label: "eBook", type: "select", col: true, options: EBOOKS },
      { key: "order_date", label: "Date", type: "date", col: true },
      { key: "amount", label: "Amount", type: "money", col: true },
      { key: "status", label: "Payment", type: "select", col: true, options: ["Paid", "Failed"] },
      { key: "access_shared", label: "Access shared", type: "bool", col: true },
      { key: "email", label: "Email", type: "text", col: true },
      { key: "phone", label: "Phone", type: "text", col: true },
      { key: "payment_mode", label: "Paid with", type: "select", options: ["UPI", "Card", "Netbanking", "Wallet", "EMI", "Other"] },
      { key: "payment_id", label: "Razorpay payment ID", type: "text" },
      { key: "error_reason", label: "Why it failed", type: "text" },
    ] },
];

export const mtab = (key: string) => MTABS.find((t) => t.key === key) || null;
/** The Team & access switch for a tab. */
export const mTabSwitch = (key: MTabKey) => `mm-${key}`;
