import Airtable from "airtable";

export function getBase() {
  const key = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!key || !baseId) return null;
  return new Airtable({ apiKey: key }).base(baseId);
}

export const TABLES = {
  snapshots: process.env.AIRTABLE_TABLE_SNAPSHOTS || "IG_Snapshots",
  posts: process.env.AIRTABLE_TABLE_POSTS || "IG_Posts",
  accounts: process.env.AIRTABLE_TABLE_ACCOUNTS || "IG_Accounts",
};
