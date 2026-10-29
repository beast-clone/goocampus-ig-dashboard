// Maheen isn't a counsellor — it's the holding pool where leads park as New / Re-Enquiry
// for the assignment automation. Relabel it everywhere in the UI (Sales Hub, Marketing Leads).
// Its own file so browser pages can use it without pulling in lib/sales-hub (server, Airtable).
export const BUCKET_NAME = "Maheen Ejaz";
export const isBucket = (name: string) => name === BUCKET_NAME;
export const counsellorLabel = (name: string) => (isBucket(name) ? "New Leads (Maheen)" : name);
